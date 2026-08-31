# Design: Carrosséis coerentes no Estúdio

> **Data:** 2026-08-30
> **Status:** Aguardando revisão do documento
> **Escopo:** Protocolo Criar carrossel, copiloto editorial, cadência visual, geração, revisão e exportação
> **Abordagem:** Deck-first sobre o Trabalho criativo canônico
> **Decisor:** Jhonatan Soares

## 1. Resumo

O Estúdio passa a oferecer o Protocolo **Criar carrossel**. O usuário começa com
um campo livre, responde somente lacunas que realmente bloqueiam o conteúdo,
revisa um deck de 5 a 8 telas e confirma uma única vez a geração.

O carrossel é uma obra única, não uma coleção de imagens independentes:

    campo livre
      → lacunas bloqueantes
      → arco e copy por tela
      → Mesa de sequência
      → contrato visual compartilhado
      → confirmar geração
      → trio de ancoragem interno
      → telas restantes
      → revisão do deck
      → exportação ordenada

Marca, fontes, fact pack, autosave, retomada, geração, cobrança, versões e
auditoria continuam pertencendo ao agregado `creative_work`. O novo domínio
acrescenta somente o que hoje não existe: deck ordenado, páginas dependentes,
copy por tela, contrato visual do conjunto e revisão por página.

Não existe gate financeiro nem aprovação humana entre o trio e o restante. O
trio é uma etapa técnica interna. Depois da confirmação editorial, o sistema
continua automaticamente enquanto os anchors passam pelos checks objetivos.

## 2. Contexto

O Creative Work atual representa propostas visuais independentes. Cada output
possui formato, direção, status, arquivo e versão próprios. Essa semântica atende
Peça única, Variações, Adaptar formatos e Mudar estilo, mas é oposta a um
carrossel:

- páginas possuem ordem e dependência narrativa;
- todas precisam compartilhar uma direção visual;
- aprovar significa aprovar o deck, não escolher uma página vencedora;
- revisar uma página precisa preservar o sistema das demais;
- o resultado final é um pacote ordenado.

O fluxo atual já oferece fundamentos úteis:

- Trabalho persistente e retomável;
- pedido, fact pack e identidade congelados;
- copy fundamentada em fatos autorizados;
- composição tipográfica e de assets exatos;
- jobs e settlement idempotentes;
- falha parcial e retry isolado;
- linhagem de revisão;
- avaliação de fidelidade da marca.

O problema não pede outro motor criativo. Pede uma semântica de deck sobre o
mesmo motor.

## 3. Precedência e compatibilidade

Esta especificação estende o modelo de Trabalho criativo de
`docs/adr/0013-trabalho-criativo-first.md` e a jornada definida em
`docs/superpowers/specs/2026-08-30-progressive-studio-flow-design.md`.

Nos pontos de conflito, esta especificação acrescenta uma quinta escolha
explícita de objetivo no Estúdio:

- Criar variações;
- Criar peça única;
- Adaptar formatos;
- Mudar estilo;
- **Criar carrossel**.

`carousel` é Protocolo/`toolKind`, não formato. O deck usa `4:5` por
padrão e pode usar `1:1`; `9:16` fica fora da primeira entrega.

Links, Trabalhos e outputs antigos permanecem legíveis. A mudança de schema e
API é aditiva. Nenhum registro existente é convertido em carrossel.

## 4. Objetivos

1. Criar carrosséis de 5 a 8 telas a partir de conteúdo livre.
2. Permitir que a IA corte, reordene e reescreva sem inventar fatos.
3. Tornar cada mudança editorial visível e corrigível.
4. Preservar uma única identidade visual com layouts variados.
5. Gerar o deck sem gate financeiro ou pausa após a confirmação editorial.
6. Permitir revisão e retry por tela sem perder o conjunto.
7. Exportar arquivos ordenados e um manifesto verificável.

## 5. Não objetivos

- publicação em redes sociais;
- editor canvas livre;
- legenda automática;
- templates criados pelo usuário;
- múltiplas direções completas por deck;
- animação ou vídeo;
- geração irrestrita de quantidade de telas;
- taxonomia ou engine genérica de protocolos;
- aprendizado automático a partir de carrosséis gerados;
- retry pago automático para corrigir gosto;
- substituição do Córtex da Marca ou do Creative Work.

## 6. Modelo mental

O usuário vê um **Trabalho de carrossel** composto por um deck ordenado.

- **Deck:** narrativa, direção visual e estado do carrossel inteiro.
- **Tela:** uma posição narrativa com copy, layout e arte próprios.
- **Versão da tela:** revisão descendente de uma tela sem sobrescrever a
  anterior.
- **Contrato visual:** regras congeladas compartilhadas por todas as telas.
- **Prancha de ancoragem:** composição interna do trio usada como uma única
  referência nas gerações restantes.

Uma tela nunca aparece como proposta concorrente. O resultado selecionável e
aprovável é o deck.

## 7. Fluxo de interação

### 7.1 Entrada livre

O usuário escolhe **Criar carrossel** dentro do Estúdio e encontra um campo
único. Ele pode inserir:

- uma ideia curta;
- um rascunho;
- um artigo;
- uma transcrição;
- um briefing;
- conteúdo já separado por telas.

Upload e referência temporária seguem as validações do Creative Work. A
referência temporária influencia somente composição, textura e clima. Ela não
vira fonte factual nem ganha autoridade sobre a identidade da marca.

### 7.2 Lacunas bloqueantes

O sistema analisa pedido, marca e fontes. Ele não exige um mini-briefing fixo.
Pergunta apenas quando a ausência impede uma decisão segura, por exemplo:

- objetivo incompatível com mais de um arco possível;
- dado citado sem fonte ou valor;
- oferta ou condição mencionada de forma ambígua;
- CTA comercial exigido pelo pedido, mas ausente;
- conflito entre o pedido e uma proibição da marca.

Público, CTA ou benefício não recebem fallback genérico. Desconhecido permanece
desconhecido.

### 7.3 Plano editorial

O copiloto cria um deck entre 5 e 8 telas. A quantidade é consequência do arco,
não preferência fixa.

Papéis narrativos permitidos:

- `hook`;
- `context`;
- `problem`;
- `argument`;
- `evidence`;
- `method`;
- `bridge`;
- `closing`;
- `cta`.

Nem todo deck usa todos os papéis. `hook` é obrigatório na primeira posição.
`cta` é opcional; quando existe, ocupa normalmente o fechamento. Desvio exige
uma justificativa editorial explícita.

O plano contém uma ideia principal por tela. A IA pode:

- cortar;
- condensar;
- reordenar;
- reescrever;
- criar transições;
- dividir uma tela densa;
- unir telas redundantes.

Ela não pode criar oferta, número, prova, benefício, credencial, prazo ou
condição sem origem no pedido ou fact pack.

### 7.4 Mesa de sequência

A revisão usa a opção aprovada **Mesa de sequência**:

- todas as telas permanecem visíveis;
- a tela selecionada abre edição detalhada;
- papel narrativo, densidade e estado aparecem no conjunto;
- drag-and-drop altera a ordem;
- adicionar e remover respeita o limite de 5 a 8;
- mudanças da IA mostram antes, depois e motivo;
- o usuário pode aceitar uma mudança, aceitar todas ou editar diretamente.

Uma edição humana vira a versão autoritativa. Sugestões posteriores não
revertem texto humano silenciosamente.

### 7.5 Contexto visual

O Córtex da Marca é a base obrigatória. Uma referência temporária é opcional.

A tela mostra um resumo corrigível:

- paleta;
- tipografia executável ou fallback declarado;
- texturas e grafismos;
- motivos recorrentes;
- três famílias de layout;
- assets exatos;
- proibições;
- referência temporária e seu papel limitado.

A primeira entrega trabalha com uma única direção visual. Não gera três decks
para escolha.

### 7.6 Confirmação

O CTA final é **Gerar carrossel**.

O clique:

1. persiste alterações pendentes;
2. executa `prepare`;
3. congela deck, fact pack, identidade e contrato visual;
4. valida saldo para todas as telas planejadas;
5. confirma a geração;
6. inicia a cadeia automática de anchors e telas restantes.

Enter nunca confirma geração. Não existe tela de custo nem gate financeiro
adicional. Saldo insuficiente continua bloqueando antes de qualquer dispatch.

## 8. Contrato editorial

O draft e o snapshot usam um envelope versionado:

```ts
type CarouselNarrativeRole =
  | "hook"
  | "context"
  | "problem"
  | "argument"
  | "evidence"
  | "method"
  | "bridge"
  | "closing"
  | "cta";

type CarouselCopyAuthority = "user_input" | "ai_proposal" | "human_edit";

type CarouselSlidePlanV1 = {
  slideId: string;
  position: number;
  role: CarouselNarrativeRole;
  purpose: string;
  primaryText: string;
  secondaryText: string | null;
  authority: CarouselCopyAuthority;
  sourceFactIds: string[];
  layoutFamily: "impact" | "development" | "respite";
};

type CarouselDeckPlanV1 = {
  version: 1;
  revision: string;
  workId: string;
  objective: string;
  audience: string | null;
  tone: string | null;
  promise: string;
  format: "4:5" | "1:1";
  slides: CarouselSlidePlanV1[];
};
```

O schema exige:

- 5 a 8 slides;
- posições contínuas e únicas;
- IDs estáveis e únicos;
- primeiro papel `hook`;
- no máximo um `cta`;
- toda alegação factual ligada a uma origem;
- texto não vazio;
- família de layout compatível com o papel.

### 8.1 Mudanças editoriais

Enquanto a sugestão não é aceita, o draft preserva:

- campo alterado;
- valor anterior;
- valor sugerido;
- justificativa;
- estado `pending | accepted | rejected | superseded`.

O snapshot confirmado guarda o texto final e uma trilha compacta das decisões,
sem enviar diffs editoriais ao provider de imagem.

### 8.2 Validação anti-slop

Antes de liberar geração, o servidor verifica:

- uma ideia principal por tela;
- promessa do gancho resolvida pelo deck;
- ausência de repetição sem função;
- transições compreensíveis;
- densidade compatível com a caixa tipográfica;
- CTA coerente e não forçado;
- ausência de frase genérica substituível por qualquer marca;
- ausência de tom blasé;
- ausência de claims não fundamentados.

O resultado é uma lista de problemas concretos, campo e correção possível.
Não existe score agregado de “qualidade”.

## 9. Contrato visual

O `CarouselVisualContractV1` é determinístico e recebe hash canônico.

```ts
type CarouselTextRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  minFontPx: number;
  maxFontPx: number;
  align: "left" | "center" | "right";
};

type CarouselLayoutPlan = {
  id: string;
  density: "high" | "medium" | "low";
  primaryRegion: CarouselTextRegion;
  secondaryRegion: CarouselTextRegion | null;
  exactAssetSlots: Array<{
    assetKey: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  backgroundInstruction: string;
};

type CarouselVisualContractV1 = {
  version: 1;
  brandSnapshotHash: string;
  temporaryReferenceId: string | null;
  palette: string[];
  typography: {
    fontAssetKey: string | null;
    fallbackFamily: string | null;
    authority: "approved" | "fallback";
  };
  layoutFamilies: {
    impact: CarouselLayoutPlan;
    development: CarouselLayoutPlan;
    respite: CarouselLayoutPlan;
  };
  recurringMotifs: string[];
  exactAssetKeys: string[];
  prohibitedElements: string[];
  safeAreaPx: number;
  contractHash: string;
};
```

### 9.1 Sistema de ritmo

A opção aprovada é **Sistema de ritmo**:

- paleta, tipografia, texturas e motivos permanecem travados;
- `impact` atende gancho e viradas;
- `development` atende argumento, evidência e método;
- `respite` atende pontes e fechamento;
- a sequência alterna densidade de forma intencional;
- layouts variam sem mudar a linguagem.

O mapeamento papel → família é produzido por regra controlada. A IA pode propor
exceção, mas a exceção entra no plano e precisa de razão legível.

### 9.2 Tipografia

Copy é autoridade textual do ADScale, não do gerador de imagem.

- Com fonte aprovada, o compositor existente aplica o arquivo oficial.
- Sem fonte executável, o produto usa seu fallback licenciado e registra
  fidelidade tipográfica limitada.
- O provider gera bases visuais sem texto e reserva as áreas previstas.
- Overflow nunca corta conteúdo silenciosamente.
- Se o texto não couber no mínimo legível, a tela volta para correção editorial
  ou recebe outra família de layout.

Assets exatos continuam sendo compostos depois da geração.

## 10. Persistência

### 10.1 Trabalho

`CREATIVE_WORK_INTENTS` recebe `carousel`, com migration aditiva no
`CHECK` de `creative_works.tool_kind`.

O draft do deck vive nas settings do Trabalho. `prepare` congela
`CarouselDeckPlanV1` e `CarouselVisualContractV1` dentro do
`inputSnapshot`, junto a fact pack e identidade.

O campo server-owned `carouselApprovedRevision` no Trabalho é nulo até a
aprovação final. Aprovar o deck grava a revisão atual; não seleciona uma
página.

### 10.2 Telas e versões

Uma nova estrutura `creative_work_carousel_slides` representa versões de
tela. Ela contém, no mínimo:

- `id`;
- `creativeWorkId`;
- `lineageId`;
- `parentSlideId`;
- `versionNumber`;
- `position`;
- `role`;
- `primaryText` e `secondaryText` congelados;
- `copyAuthority` e `sourceFactIds`;
- `layoutFamily`;
- `status: draft | queued | processing | completed | failed`;
- `outputKey` e `previewKey`;
- `visualContractHash`;
- `anchorKey`, obrigatório nas telas não-anchor e nulo nos anchors;
- `generationOperationKey`;
- `errorCode` tipado;
- `isCurrent`;
- timestamps.

Restrições:

- uma versão corrente por lineage;
- uma posição corrente por Trabalho;
- version number único por lineage;
- operation key única;
- toda tela pertence ao mesmo workspace e marca do Trabalho.

`creative_work_outputs` não ganha `pageIndex` e não representa páginas.
Semântica, seleção e índices dos outputs existentes permanecem intactos.

## 11. Preparação e geração

### 11.1 Prepare

`prepare`:

1. valida deck e fact pack;
2. executa o lint editorial;
3. resolve identidade e referência temporária;
4. cria o contrato visual;
5. resolve planos tipográficos;
6. calcula internamente a cotação para o número de telas;
7. devolve a projeção corrigível;
8. não chama o provider de imagem.

Alterar texto, ordem, papel, formato, marca, fonte ou referência após
`prepare` invalida o snapshot e exige nova preparação.

### 11.2 Trio de ancoragem

Depois da confirmação, o sistema seleciona deterministicamente:

- posição 1;
- posição `ceil(slideCount / 2)`;
- última posição.

A geração é dependente:

1. capa usa Córtex, contrato e referência temporária;
2. meio usa o mesmo contexto e a capa como referência;
3. fechamento usa o mesmo contexto e os anchors disponíveis;
4. o compositor aplica copy e assets exatos;
5. checks objetivos validam o trio;
6. o trio vira uma única prancha de ancoragem.

A prancha ocupa um slot de referência nas telas restantes e preserva espaço
para os inputs autorizados da marca. Ela é um artefato interno, não entra na
Biblioteca.

### 11.3 Telas restantes

As posições restantes recebem:

- o mesmo snapshot de identidade;
- o mesmo fact pack;
- o mesmo contrato visual e hash;
- a prancha de ancoragem;
- papel e família de layout da posição;
- copy exata da tela.

Elas podem executar em paralelo porque dependem da mesma prancha congelada, não
umas das outras.

## 12. QA

### 12.1 Checks objetivos

Bloqueiam a tela afetada:

- arquivo ausente, inválido ou indecodificável;
- dimensão ou proporção errada;
- overflow ou texto abaixo do mínimo legível;
- copy diferente da versão congelada;
- asset exato ausente ou alterado;
- visual contract hash divergente;
- referência não autorizada;
- violação factual ou de marca já detectável.

Se um anchor falha, as telas restantes ainda não são despachadas. O Trabalho
permanece retomável e oferece retry manual somente do anchor.

### 12.2 Avaliação do conjunto

Depois de todas as telas prontas, uma contact sheet permite comparar:

- paleta;
- hierarquia tipográfica;
- motivos recorrentes;
- alternância de densidade;
- continuidade de produto, personagem ou objeto;
- mudanças inexplicáveis de linguagem.

Checks determinísticos reaproveitam Sharp, planos tipográficos e fidelidade da
marca existentes. Avaliação visual subjetiva produz alerta, nunca retry
automático nem reprovação objetiva.

## 13. Cobrança e idempotência

O usuário não vê preço por operação nem aprova um gate financeiro.

Antes do dispatch, o servidor valida saldo para o deck planejado. Settlement
continua usando a unidade de geração visual existente por tela:

- cada tela possui operation key própria;
- cobrança ocorre somente para dispatch real;
- falha antes do provider não consome unidade;
- compensação e refund seguem o contrato atual;
- retry manual cria tentativa idempotente;
- nenhuma correção subjetiva dispara retry oculto.

Uma falha de anchor impede o dispatch das telas restantes e, portanto, evita
cobrança por trabalho que não começou.

## 14. Revisão e versões

A Mesa de sequência final mostra:

- todas as telas;
- estado individual;
- versão corrente;
- alertas objetivos e subjetivos;
- preview em tamanho real.

Ações:

### Alterar copy

Cria nova versão textual e recompõe somente a tela. Não chama o provider visual
se o plano continua comportando o texto.

### Refazer uma tela

Cria descendente visual com o mesmo contrato e prancha. A versão anterior
permanece disponível.

### Mudar direção global

Cria nova revisão do deck e executa novamente trio → restante. O deck anterior
não é sobrescrito.

### Reordenar

O servidor recalcula papéis e famílias. Somente telas cuja posição ou família
mudou são invalidadas. A interface mostra esse conjunto antes da confirmação.

Falhas parciais preservam as telas prontas. Reload reconstrói o estado
persistido e reconcilia gerações incertas antes de permitir retry.

## 15. Aprovação e exportação

Aprovação referencia a revisão atual do deck e exige:

- 5 a 8 posições correntes;
- todas as posições com versão válida;
- nenhum check objetivo reprovado;
- ordem contínua;
- manifesto reconstruível.

Entrega mínima:

- download individual;
- ZIP com `01.png` a `08.png`;
- manifesto JSON com ordem, papel, copy, hashes e versões;
- preview do conjunto na Mesa de sequência.

Não há publicação social nem geração de legenda.

## 16. Componentes e limites

### UI

- `CreativeToolCards`: apresenta Criar carrossel.
- `CreativeComposer`: roteia `carousel` para um fluxo dedicado sem absorver
  toda a lógica.
- `useCarouselComposer`: controla draft, plan, autosave e ações do wizard.
- `CarouselSequenceBoard`: visão do conjunto e reordenação.
- `CarouselSlideEditor`: copy, mudança sugerida e preview da tela.
- `CarouselVisualSummary`: contrato visual e referência temporária.
- `CarouselDeckReview`: estados, versões e exportação.

O stepper pode reutilizar o padrão visual de `BrandTrainingStepper`, mas não
o domínio do Brand Training. O guided flow do Assistant não é transplantado.

### Servidor

- planner editorial específico de carrossel que reutiliza fact pack e voz;
- construtor puro do contrato visual;
- aplicação de `prepare` para carrossel;
- coordenador de anchors e dispatch restante;
- repositório de slides;
- revisão/exportação específicas de deck;
- extensão dos adapters de settlement sem novo sistema financeiro.

Não será criada interface genérica de “multi-page creative”.

## 17. API

Mudanças são aditivas e permanecem sob `creative-work`:

- criar draft aceita `intent: "carousel"`;
- GET do Trabalho inclui draft/plan e páginas quando o intent é carousel;
- POST de plan gera ou regenera o plano editorial;
- PATCH existente persiste mudanças e invalida snapshots;
- prepare e generate mantêm as rotas canônicas;
- revisão de slide cria descendente por ID;
- export devolve manifesto e ZIP do deck.

IDs de Trabalho, slide, referência e asset são revalidados no servidor. Nenhuma
rota aceita página de outro workspace ou marca.

## 18. Erros e recuperação

| Falha | Comportamento |
| --- | --- |
| Lacuna factual | Pergunta antes do plano final |
| Plano inválido | Mantém texto e aponta a tela/campo |
| Referência incompatível | Mantém o deck e remove somente a referência |
| Fonte ausente | Usa fallback declarado e limita o veredito tipográfico |
| Saldo insuficiente | Não despacha nenhuma tela |
| Anchor objetivo falha | Pausa restantes; retry manual do anchor |
| Tela não-anchor falha | Preserva as demais; retry manual isolado |
| Avaliação subjetiva alerta | Mostra alerta; não retry automático |
| Rede ou aba fecha | Geração continua e o estado é reconciliado |
| Export falha | Mantém deck; permite reconstruir pacote |

## 19. Telemetria

O funil canônico permanece:

- Trabalho iniciado;
- briefing/plano pronto;
- geração confirmada;
- resultado pronto;
- Trabalho revisado;
- Trabalho aprovado;
- Trabalho retomado.

Propriedades adicionais:

- `protocol: carousel`;
- `slideCount`;
- `inputKind`;
- `blockingQuestionCount`;
- `anchorState`;
- `failedSlideCount`;
- `manualRetryCount`;
- `deckRevisionCount`.

`output_ready` representa o deck completo. Estado por tela entra apenas em
telemetria operacional, sem duplicar o funil de produto.

## 20. Testes

### Unidade

- schema de 5 a 8 telas;
- posições e IDs únicos;
- papéis e CTA;
- grounding por fact pack;
- autoridade de edição humana;
- diffs editoriais;
- lint de repetição, densidade e arco;
- mapeamento papel → família;
- hash do contrato visual;
- seleção determinística do trio;
- invalidação por copy, ordem e direção;
- resolução de estado agregado;
- nomes e ordem do export.

### Integração

- isolamento por workspace e marca;
- draft, prepare e snapshot;
- migration e intent `carousel`;
- criação idempotente de páginas;
- dispatch dependente do trio;
- prancha compartilhada;
- settlement por tela;
- falha e retry parcial;
- recomposição textual sem provider;
- versões descendentes;
- aprovação do deck;
- ZIP e manifesto.

### UI

- entrada livre;
- pergunta bloqueante;
- mudanças antes/depois;
- aceitar, editar, adicionar, remover e reordenar;
- Mesa de sequência em desktop e mobile;
- teclado, foco, drag-and-drop com alternativa;
- estados de geração;
- revisão e download.

### E2E

1. iniciar por texto cru;
2. responder uma lacuna;
3. receber 5 a 8 telas;
4. aceitar e editar sugestões;
5. confirmar geração;
6. gerar trio e restante sem pausa;
7. falhar uma tela;
8. repetir somente essa tela;
9. alterar copy sem provider visual;
10. aprovar e exportar o deck.

## 21. Gate humano

Avaliar nove carrosséis:

- três marcas;
- três entradas por marca: ideia curta, texto longo e conteúdo já dividido;
- 5 a 8 telas por deck.

Aprovação exige:

- zero fatos inventados;
- zero textos corrompidos;
- pelo menos oito decks reconhecidos como uma linguagem visual única;
- pelo menos oito com progressão narrativa clara;
- nenhuma tela que dependa de explicação externa para cumprir sua função.

Automação, geração real e julgamento humano são evidências separadas.

## 22. Rollout e rollback

O Protocolo entra atrás de um único rollout determinístico por workspace.

Sequência:

1. migration aditiva;
2. testes locais e E2E controlado;
3. nove decks do gate humano;
4. habilitação interna;
5. rollout restrito;
6. expansão após observar geração, falha, retry e exportação;
7. remoção do flag depois da estabilidade.

Rollback desabilita novas criações. Trabalhos existentes continuam legíveis,
retomáveis e exportáveis. Nenhum dado é apagado.

Rollback imediato se ocorrer:

- perda ou troca de ordem;
- geração com snapshot obsoleto;
- cobrança duplicada;
- página de outra marca/workspace;
- copy divergente da aprovada;
- deck aprovado com posição ausente;
- retry que sobrescreve versão anterior.

## 23. Simplificações deliberadas

- uma direção visual por deck;
- uma referência temporária opcional;
- exatamente três famílias de layout;
- trio automático sem aprovação humana intermediária;
- uma prancha congelada para todas as telas restantes;
- avaliação subjetiva não bloqueia nem corrige automaticamente;
- sem caption, publicação ou canvas livre;
- sem engine genérica multi-page.

Essas simplificações só devem ser revistas após evidência de falha real.

## 24. Definição de pronto

Criar carrossel está pronto quando:

- aparece como Protocolo próprio no Estúdio;
- aceita conteúdo livre e pergunta somente lacunas bloqueantes;
- cria e persiste decks de 5 a 8 telas;
- mostra mudanças editoriais verificáveis;
- mantém fatos fundamentados;
- permite revisão pela Mesa de sequência;
- congela contrato visual e hash único;
- produz trio, prancha e restantes sem pausa humana;
- preserva coerência sem repetir o mesmo layout;
- permite correção por tela e revisão global sem sobrescrever versões;
- exporta PNGs ordenados, ZIP e manifesto;
- testes automatizados passam;
- gate humano atende aos critérios;
- rollout não aciona condição de rollback.
