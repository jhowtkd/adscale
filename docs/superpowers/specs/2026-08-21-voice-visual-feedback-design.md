# Design: feedback por voz e marcações visuais em outputs

> **Data:** 2026-08-21
> **Status:** Aprovado no brainstorming; aguardando revisão do documento
> **Escopo:** feedback geral, revisão de Creative Work e comentários de marcação
> **Abordagem:** transcrição no servidor e marcações efêmeras compiladas no comando canônico de revisão
> **Decisor:** Jhonatan Soares

---

## 1. Objetivo

Permitir que o usuário dite feedback e aponte alterações em regiões específicas de um output sem criar um editor gráfico, um fluxo paralelo de geração ou um novo modelo persistente de comentários.

O contrato do MVP é:

```text
falar ou escrever o feedback
+ marcar até cinco áreas opcionais no output
+ confirmar uma única revisão de 5 créditos
```

O texto transcrito sempre permanece editável. As marcações são rascunhos locais até o envio e não formam um sistema de colaboração assíncrona.

## 2. Decisões aprovadas

1. **Voz no primeiro recorte:** feedback geral, revisão de output e comentário de cada marcação.
2. **Transcrição:** gravação curta enviada ao servidor para obter comportamento consistente entre navegadores.
3. **Marção:** seleção retangular sobre o preview, com comentário numerado.
4. **Destino:** todas as marcações formam uma única solicitação para gerar nova versão.
5. **Persistência:** rascunhos efêmeros; atualizar ou fechar a página antes do envio os descarta.
6. **Mobile:** voz e revisão textual funcionam; desenhar áreas exige desktop no MVP.
7. **Geração:** o comando canônico e idempotente de Creative Work continua sendo a única porta de revisão.

## 3. Evidência e seams existentes

O produto já possui quase todo o fluxo necessário:

- `CreativeProposalGrid` controla miniaturas, output selecionado e preview ampliado;
- `CreativeResultCard` já coleta instrução textual e anexo opcional;
- `useCreativeComposer.reviseOutput` faz upload do anexo, cria a chave idempotente e preserva a tentativa em falhas;
- `POST /api/creative-work/[id]/generate` valida e encaminha a revisão;
- `reviseCreativeWorkOutput` cobra 5 créditos e despacha pelo settlement canônico;
- `CreativeAnnotationEditor` já desenha retângulos normalizados, exige comentário e lista marcações numeradas;
- `uploadChatAttachment` já transforma uma imagem local em `revisionAssetId`;
- o SDK `openai` instalado expõe `audio.transcriptions.create` e o projeto já possui cliente OpenAI server-side;
- `checkRateLimit` fornece a categoria `ai` por workspace.

Esses seams devem ser reutilizados. Não haverá segunda API de geração, segunda política de cobrança ou duplicação do editor de retângulos.

## 4. Arquitetura

### 4.1 Controle reutilizável de voz

Um componente client-side `VoiceInputButton` encapsula `MediaRecorder`, permissão do microfone e os estados da transcrição. Sua saída é somente `onTranscript(text)`; o campo pai continua dono do valor e aplica seu próprio limite.

Integrações do MVP:

- `FeedbackModal`: acrescenta a transcrição a `message`;
- `CreativeResultCard`: acrescenta a transcrição a `instruction`;
- `CreativeAnnotationEditor`: acrescenta a transcrição ao comentário da área em rascunho.

O componente não envia feedback nem revisão. Ele apenas converte áudio em texto editável.

### 4.2 Endpoint de transcrição

`POST /api/feedback/transcribe` recebe `multipart/form-data` com um único `file`:

1. exige `requireWorkspaceAccess`;
2. aplica `checkRateLimit(request, { category: "ai", workspaceId })`;
3. rejeita arquivo vazio, maior que 10 MB ou fora de `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav` e `audio/ogg`;
4. chama `getOpenAI().audio.transcriptions.create` com `gpt-4o-mini-transcribe` e idioma português;
5. retorna `{ text }` após `trim`, limitado a 4.000 caracteres, ou 422 quando não houver fala reconhecida;
6. não grava arquivo, transcrição ou payload do provedor em Storage, banco ou logs.

O cliente encerra automaticamente a gravação em 60 segundos. O limite de bytes no servidor é o controle autoritativo; validar duração binária no servidor exigiria parser adicional e está fora do MVP.

### 4.3 Editor de marcações no output

O modal ampliado de `CreativeProposalGrid` passa a ter:

- preview anotável à esquerda;
- lista de comentários à direita;
- controle de voz em cada comentário;
- ação `Gerar nova versão · 5 créditos`.

As marcações ficam em estado React indexado por `outputId`, permitindo alternar miniaturas sem misturar rascunhos. Cada item possui somente:

```ts
{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
}
```

As coordenadas continuam normalizadas em `[0, 1]`. O MVP aceita no máximo cinco áreas e limita cada comentário a 300 caracteres, mantendo a instrução final abaixo do contrato atual de 2.000 caracteres.

`CreativeAnnotationEditor` deve ser generalizado apenas no tipo de entrada necessário para aceitar dados locais e dados do Goal Assistant. Seu algoritmo de pointer events, normalização e lista numerada permanece único. A localização do arquivo pode permanecer em `components/assistant` neste recorte; mover o componente não entrega comportamento adicional.

### 4.4 Compilação da revisão

Ao confirmar:

1. a imagem do output é buscada pela rota autenticada e desenhada num `<canvas>` nativo;
2. retângulos e números são desenhados sobre uma cópia, sem alterar o output salvo;
3. o canvas gera um `File` PNG;
4. os comentários formam uma instrução determinística:

```text
Aplique somente as alterações numeradas na imagem anotada.
Mantenha os demais elementos da arte.

1. Diminuir o título e aumentar o respiro.
2. Trocar o CTA por "Conheça agora".
```

5. `onRevise(outputId, instruction, annotatedFile)` reutiliza o upload, a chave idempotente, a cobrança, o dispatch e o acompanhamento existentes.

Para o chamador distinguir sucesso de falha, `useCreativeComposer.reviseOutput` passa a retornar `Promise<boolean>`: `true` somente depois que o comando recebe 202 e `false` no caminho de erro já tratado. `CreativeResultCard` pode ignorar esse retorno; `CreativeProposalGrid` o usa para limpar as marcações somente no sucesso. O erro não deve ser relançado, preservando o comportamento atual do formulário manual.

Não são enviados valores `x/y` ao provedor. A imagem numerada é a autoridade espacial; o texto fornece a instrução correspondente.

## 5. Fluxo de dados

### 5.1 Voz

```text
usuário toca no microfone
  → navegador solicita permissão
  → MediaRecorder acumula Blob
  → POST /api/feedback/transcribe
  → autenticação + rate limit + validação do arquivo
  → OpenAI transcription
  → { text }
  → campo acrescenta texto editável
```

### 5.2 Marcações

```text
output selecionado
  → retângulos + comentários em estado local
  → canvas produz imagem anotada
  → compilador produz instrução numerada
  → reviseOutput existente faz upload e dispatch
  → nova CreativeWorkOutput versionada
```

## 6. Estados e comportamento de interface

### 6.1 Voz

```text
pronto → gravando 00:00 → transcrevendo → pronto | erro
```

- o botão possui nome acessível e `aria-pressed` enquanto grava;
- tempo e transcrição são anunciados em região `aria-live`;
- o usuário pode parar antes de 60 segundos;
- o envio do campo fica desabilitado enquanto grava ou transcreve;
- texto existente nunca é substituído;
- permissão negada, áudio vazio e falha do provedor preservam o campo;
- quando `MediaRecorder` ou `getUserMedia` não existem, o controle não aparece e a digitação continua disponível.

### 6.2 Marcações

- retângulos menores que 1% continuam rejeitados;
- cada retângulo exige comentário não vazio;
- remover ou refazer não chama servidor;
- trocar o output selecionado não mistura as marcações;
- sucesso da revisão limpa somente o output enviado e fecha o modal;
- falha mantém imagem, comentários e chave da tentativa para retry;
- no mobile, o preview mostra o aviso existente de desenho indisponível e mantém a revisão textual com voz.

## 7. Segurança, privacidade e custo

- microfone depende de gesto explícito e permissão do navegador;
- a rota de transcrição é autenticada e limitada por workspace;
- MIME e tamanho são validados no trust boundary;
- nenhum áudio é persistido;
- logs registram somente código de resultado, tamanho e tipo, nunca áudio ou transcrição;
- mensagens ao cliente não expõem payloads do provedor;
- transcrição usa o custo do provedor, sem débito de crédito do produto neste MVP;
- gerar a revisão continua custando exatamente `GENERATION_CREDIT_COSTS.creativeWorkOutput`, hoje 5 créditos;
- chamadas pagas reais de smoke permanecem um gate separado e exigem autorização explícita.

## 8. Tratamento de falhas

| Falha | Comportamento |
| --- | --- |
| Permissão do microfone negada | mostra orientação curta; mantém digitação |
| Navegador sem gravação | oculta o microfone; mantém digitação |
| Áudio inválido ou grande | retorna 400/413; preserva o campo |
| Rate limit | retorna 429 com retry; preserva o campo |
| Provedor de transcrição falha | erro genérico e retry; não persiste o áudio |
| Download do output ou Canvas falha | não faz upload nem cobra revisão |
| Upload da imagem anotada falha | preserva marcações; não despacha revisão |
| Crédito insuficiente | usa o erro 402 atual; preserva marcações |
| Dispatch da revisão falha | preserva rascunho e tentativa idempotente atual |

## 9. Arquivos e responsabilidades

### Novos

- `app/src/components/ui/VoiceInputButton.tsx`: gravação, estados e callback de texto.
- `app/src/components/ui/VoiceInputButton.test.tsx`: permissão, gravação, transcrição e erro.
- `app/src/app/api/feedback/transcribe/route.ts`: trust boundary e chamada do SDK.
- `app/src/app/api/feedback/transcribe/route.test.ts`: autenticação, rate limit, arquivo e provedor mockado.
- `app/src/components/creative-work/output-annotation.ts`: compilação textual e renderização Canvas.
- `app/src/components/creative-work/output-annotation.test.ts`: ordem, limites e desenho determinístico.

### Alterados

- `app/src/components/feedback/FeedbackModal.tsx` e teste: controle de voz no feedback geral.
- `app/src/components/creative-work/CreativeResultCard.tsx` e teste: voz na revisão textual e custo visível.
- `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx` e teste: modal de marcação, estado por output e envio único.
- `app/src/components/creative-work/useCreativeComposer.ts` e teste: resultado booleano da revisão sem alterar o tratamento de erro atual.
- `app/src/components/assistant/CreativeAnnotationEditor.tsx` e teste: tipo de anotação reutilizável, limite opcional e voz no comentário.
- `app/messages/pt-BR.json` e `app/messages/en.json`: estados, erros e rótulos acessíveis.

Não há alteração de schema, migration, repositório, settlement ou job de geração.

## 10. Validação

### 10.1 Testes automatizados

1. `VoiceInputButton`
   - inicia e para por gesto;
   - encerra em 60 segundos;
   - envia `FormData` uma vez;
   - anuncia estados;
   - entrega texto somente no sucesso;
   - preserva o campo em erro.
2. Rota de transcrição
   - exige workspace;
   - aplica rate limit `ai`;
   - rejeita MIME, zero bytes e tamanho acima do limite;
   - chama `gpt-4o-mini-transcribe` com o arquivo aceito;
   - não faz chamada real nos testes.
3. Marcações
   - preservam coordenadas normalizadas;
   - respeitam cinco itens e 300 caracteres;
   - geram numeração e instrução na mesma ordem;
   - produzem um PNG sem alterar a fonte.
4. Integração do composer
   - rascunhos são isolados por `outputId`;
   - uma confirmação chama `onRevise` exatamente uma vez;
   - retorno `true` limpa; retorno `false` preserva;
   - revisão manual sem marcações continua funcionando;
   - mobile não habilita desenho.

### 10.2 Checks locais

- testes focados dos arquivos alterados;
- `npm run typecheck`;
- ESLint nos arquivos alterados;
- `git diff --check`;
- nenhuma chamada paga real.

### 10.3 QA visual e funcional

- desktop: gravar, editar transcrição, desenhar cinco áreas, remover uma e confirmar;
- desktop: alternar outputs e verificar isolamento dos rascunhos;
- mobile: microfone e texto disponíveis, desenho desabilitado com orientação;
- falhas: permissão negada, transcrição indisponível e preparação da imagem com erro;
- acessibilidade: teclado, foco, nomes acessíveis e anúncios de estado.

Um smoke pago posterior deve separar evidência de transcrição, dispatch da revisão, conclusão do output e revisão humana do resultado.

## 11. Critérios de aceite

1. Os três campos aprovados oferecem o mesmo controle de voz quando o navegador suporta gravação.
2. A transcrição é editável e nunca dispara envio automático.
3. O áudio não é persistido.
4. O desktop permite até cinco marcações retangulares comentadas por output.
5. Uma confirmação produz uma imagem anotada e uma instrução numerada.
6. Exatamente uma revisão canônica de 5 créditos é solicitada.
7. Falhas antes do comando não cobram; falhas do comando preservam o rascunho.
8. Mobile preserva voz e texto sem desenho por toque.
9. Feedback digitado e revisão manual existentes não sofrem regressão.

## 12. Fora de escopo

- integração com Canva;
- edição de elementos, texto, camadas ou vetores;
- seta, desenho livre, cores e desfazer/refazer;
- pins sem área;
- desenho por toque no mobile;
- salvar rascunhos de marcação após refresh;
- histórico, atribuição, threads ou colaboração assíncrona;
- nova tabela de annotations;
- guardar ou reproduzir áudio;
- streaming/realtime transcription;
- ditado nativo como segundo provedor;
- débito de crédito do produto para transcrição.

Se retomada de rascunhos ou colaboração se tornar uma necessidade observada, a próxima evolução é persistir marcações por `creativeWorkOutputId`. A tabela polimórfica compartilhada com o Goal Assistant só deve ser considerada se dois fluxos persistentes realmente precisarem do mesmo ciclo de vida.
