# Design: Estúdio progressivo e fluxo criativo compreensível

> **Data:** 2026-08-30
>
> **Status:** Aguardando revisão do documento
>
> **Escopo:** Entrada do Estúdio, preparação, confirmação, resultados, retomada, campanhas e referências
>
> **Abordagem:** Casca progressiva sobre o Trabalho criativo canônico
>
> **Decisor:** Jhonatan Soares

## 1. Resumo

O Estúdio passa a oferecer uma única jornada:

```text
texto, arte ou ambos
  → objetivo explícito
  → análise dos materiais
  → plano corrigível
  → confirmação
  → geração
  → revisão e refinamento no mesmo Trabalho
```

O redesenho reduz decisões simultâneas sem esconder consequências criativas. Ele reutiliza o agregado `creative_work`, seus drafts, fontes, preparação, geração, outputs, versões, retry, aprovação, campanha opcional e settlement. Não cria roteador de intenção, pipeline, persistência ou superfície de resultados paralelos.

O público prioritário é a pessoa em primeiro uso, sem treinamento. Usuários recorrentes preservam atalhos, retomada e ajustes opcionais, mas esses elementos não comandam a primeira tela.

## 2. Contexto e evidência

A tela atual pede duas classificações relacionadas antes da criação:

1. `Com arte` ou `Com briefing`;
2. `Variações`, `Peça única`, `Adaptar formatos` ou `Mudar estilo`.

O primeiro controle deriva do mesmo `intent` controlado pelo segundo. Essa duplicação aumenta a carga cognitiva sem representar uma decisão de domínio independente.

A mesma tela também dá peso simultâneo a retomada, nova campanha, marca, protocolos, composer, direções, ajustes e um mural de inspirações. Depois da geração, entradas e configurações continuam competindo visualmente com os resultados.

O backend não possui essa duplicação conceitual. O fluxo canônico já oferece:

- Trabalho persistente e retomável;
- um Protocolo por Rascunho;
- fontes com análise independente;
- preparação separada da geração no servidor;
- outputs parciais e retry individual;
- versões descendentes para refinamento;
- campanha opcional;
- cobrança, compensação e refund idempotentes.

Portanto, o problema principal é a apresentação e a ordem das decisões, não a ausência de outro motor criativo.

## 3. Precedência e decisões substituídas

Esta especificação estende o [ADR 0013 — Trabalho criativo-first](../../adr/0013-trabalho-criativo-first.md). `creative_work` continua sendo a espinha canônica, e todas as superfícies continuam sendo adapters desse agregado.

Nos pontos de conflito, esta especificação substitui decisões de UX do [fluxo sem fricção de 2026-07-16](2026-07-16-frictionless-creative-flow-home-design.md) e da interface adicionada posteriormente:

- o nome visível da superfície principal passa de **Início** para **Estúdio**;
- texto e arquivo aparecem antes da escolha do objetivo;
- o objetivo é sempre escolhido explicitamente; não é inferido silenciosamente;
- o Rascunho canônico nasce depois de existir entrada e objetivo;
- `Com arte / Com briefing` deixa de existir;
- campanha permanece visível como ação secundária, nunca como pré-requisito;
- inspirações deixam de ser um mural permanente e entram por `Adicionar referência`;
- a configuração recolhe quando resultados passam a existir;
- nenhum valor de créditos por operação é mostrado no fluxo.

A decisão de não exibir custo por operação substitui deliberadamente a parte de disclosure do requisito `CRED-01`. O saldo global continua visível na conta ou sidebar. Cotação, débito, compensação, refund e auditoria permanecem internos e inalterados.

A implementação desta especificação deve atualizar `CONTEXT.md`, traduções e requisitos afetados para eliminar a divergência entre **Início** e **Estúdio** e registrar a nova política de exposição de créditos.

## 4. Objetivos

1. Permitir começar por texto, arte ou ambos sem escolher previamente um modo.
2. Fazer cada decisão aparecer somente quando houver contexto para entendê-la.
3. Manter o usuário no mesmo Trabalho da preparação à revisão.
4. Tornar explícitos objetivo, papel dos materiais, preservação, exploração, quantidade e formato antes da geração.
5. Preservar rascunhos, outputs e versões em falhas, reloads e trocas de protocolo.
6. Reduzir campanha, referências e ajustes ao peso necessário para a tarefa atual.
7. Medir compreensão e conclusão antes de remover a experiência anterior.

## 5. Não objetivos

- criar um roteador automático de intenção;
- criar um protocolo genérico no backend;
- alterar regras de preço, débito, refund ou settlement;
- criar uma página ou persistência paralela de resultados;
- criar um novo recomendador ou feed externo de inspirações;
- expandir referências temporárias para protocolos que não as suportam;
- reformular Brand Training, Biblioteca ou Campanhas;
- adicionar `Criar variações desta peça`, `Adaptar formato` ou `Mudar estilo` como novas ações contextuais na primeira entrega;
- manter duas experiências primárias depois do gate de rollout.

## 6. Modelo mental e arquitetura da informação

O modelo apresentado ao usuário é:

> Tudo começa e continua como um Trabalho dentro do Estúdio.

### 6.1 Navegação e cabeçalho

- **Estúdio** é o destino principal de criação.
- O seletor de marca permanece no cabeçalho.
- **Nova campanha** permanece disponível como ação secundária, sem preenchimento verde ou peso equivalente à criação. Ela cria uma campanha de verdade; não redireciona de volta ao composer.
- Campanha continua sendo agrupamento opcional de Trabalhos.
- A associação nunca volta a pedir marca, pedido ou materiais já persistidos no Trabalho.

`Nova campanha` abre um diálogo mínimo:

```text
Nome da campanha     obrigatório
Marca                marca ativa, somente leitura
[Cancelar] [Criar campanha]
```

O diálogo usa o endpoint canônico de campanhas, preenchendo `clientProfileId` e o nome de cliente a partir da marca ativa. Não solicita produto, público, plataforma, formato ou briefing.

Se um Trabalho já existe, a campanha criada é associada a ele após confirmação bem-sucedida. Se ainda não existe Trabalho, o identificador fica como contexto do composer e é associado quando o Rascunho canônico for criado. A falha de criação permanece no diálogo e não altera o Trabalho.

### 6.2 Retomada

Quando existe um Trabalho acionável, uma faixa compacta aparece acima do composer com:

- preview;
- nome do Trabalho;
- marca;
- estado operacional;
- próxima ação específica.

A faixa não substitui o composer e não bloqueia uma nova criação.

### 6.3 Inspirações

O mural permanente deixa a página. `Adicionar referência` abre uma gaveta que reutiliza exclusivamente o catálogo curado já servido por `listCreativeInspirations`. A primeira entrega não reintroduz templates, Trabalhos aprovados nem filtragem por marca.

Cada item mostra sua origem curada e usa o CTA explícito **Usar para mudar estilo**. Esse CTA seleciona `Mudar estilo` de forma declarada, anexa o item no slot de referência de Estilo e leva o foco ao slot de arte original. O clique na imagem, isoladamente, apenas abre o preview e não muda o objetivo.

Não há feed externo, busca nova, sourcing por workspace ou novo algoritmo de recomendação nesta entrega.

## 7. Fluxo de interação

### 7.1 Entrada livre

O composer pergunta **“O que você quer criar?”** e aceita no mesmo bloco:

- texto livre;
- arrastar e soltar;
- seletor `Adicionar arte ou referência`.

Texto e upload possuem o mesmo peso visual. Nenhum Protocolo é selecionado silenciosamente.

Antes da escolha do objetivo, texto e arquivos selecionados ficam num buffer local do composer. O upload persistente ainda não começa. A escolha de objetivo aparece imediatamente após a primeira entrada para reduzir o intervalo não persistido.

O buffer anterior ao objetivo aceita no máximo um arquivo. Materiais adicionais são escolhidos depois que o Protocolo revela seus slots reais. Se o usuário soltar vários arquivos, a UI mantém o primeiro e informa que os demais poderão ser adicionados após a escolha do objetivo.

Um arquivo selecionado antes do objetivo não é recuperável após reload, pois o navegador não permite restaurar um `File` arbitrariamente. Essa janela curta é uma simplificação deliberada. Persistência retomável começa após a escolha do objetivo.

### 7.2 Escolha do objetivo

Depois da primeira entrada, aparecem quatro opções compactas:

- Criar variações;
- Criar peça única;
- Adaptar formatos;
- Mudar estilo.

Objetivos incompatíveis com os materiais atuais continuam visíveis. Selecioná-los abre o input necessário e explica o requisito, em vez de apresentar um erro.

A seleção cria o Rascunho canônico no Protocolo correspondente. A partir desse momento, URL, upload e autosave ficam ativos.

### 7.3 Papel dos materiais

O composer não oferece uma taxonomia universal que prometa autoridade inexistente. Ele apresenta os papéis e cardinalidades próprios de cada Protocolo:

| Objetivo | Materiais | Decisão visível | Autoridade |
| --- | --- | --- | --- |
| Peça única | pedido + zero a três referências temporárias | categoria corrigível da referência | pedido e marca sustentam fatos; referência nunca vira fonte factual |
| Variações | pelo menos uma arte-base | Conteúdo, Estilo ou Conteúdo + estilo | uso escolhido + pedido + marca |
| Adaptar formatos | uma arte original | papel fixo `Arte original` | conteúdo e estilo da arte original |
| Mudar estilo | duas fontes distintas | `Arte original` e `Referência de estilo` | conteúdo da original e estilo da referência, após resolver autoridade de marca |

As categorias de Peça única permanecem as canônicas: pessoa/personagem, produto/embalagem, logo/selo adicional, objeto/cena obrigatória, gráfico/textura ou referência de estilo. Classificação automática de baixa confiança exige correção; o limite continua sendo três.

Em `Mudar estilo`, uma única fonte não pode ocupar os dois slots. Em `Adaptar formatos`, não existe seletor de uso. O composer revela esses requisitos depois da escolha do objetivo, sem uniformizar contratos diferentes no backend.

Regras de identidade e proibições da marca continuam prevalecendo. Referência visual não sustenta fatos apenas por parecer semelhante ao pedido.

Upload e análise possuem estado por arquivo. Retry ou remoção de um arquivo não afeta pedido nem outras fontes.

### 7.4 Preparação

Quando objetivo e materiais obrigatórios estão prontos, o CTA **Continuar** executa apenas `prepare`.

`prepare` pode analisar, resolver briefing, direções, formatos e cotação interna, mas não pode:

- iniciar job de geração;
- debitar créditos;
- reservar geração;
- chamar o provider de imagem.

O resultado inclui uma projeção pública, versionada e retomável:

```ts
type PreparedPlanProjectionV1 = {
  version: 1;
  workId: string;
  preparedRevision: string;
  protocol: "variations" | "single" | "format_adaptation" | "restyle";
  materials: Array<{
    sourceId: string;
    label: string;
    role: "content" | "style" | "both" | "piece_reference" | "original_art";
    category: string | null;
    treatment:
      | "identity_preservation"
      | "recognizable_preservation"
      | "exact_application"
      | "required_presence"
      | "visual_language"
      | "style_direction"
      | null;
  }>;
  preserve: Array<
    | "verified_facts"
    | "brand_requirements"
    | "source_content"
    | "source_visual_identity"
    | "piece_reference_identity"
    | "piece_reference_recognizability"
    | "piece_reference_exact_application"
    | "piece_reference_required_presence"
  >;
  explore: Array<
    | "composition"
    | "hierarchy"
    | "visual_language"
    | "format_layout"
    | "new_execution"
    | "piece_reference_visual_language"
    | "piece_reference_style_direction"
  >;
  outputs: Array<{
    label: string;
    targetFormat: "1:1" | "4:5" | "9:16";
    directionId: string | null;
  }>;
  outputCount: number;
  formats: Array<"1:1" | "4:5" | "9:16">;
};
```

Os arrays `preserve` e `explore` são produzidos por um mapeamento puro por Protocolo, nunca por texto livre do modelo. A UI traduz as chaves para frases humanas. A projeção usa somente `inputSnapshot`, Protocolo, settings, fontes e planos da cotação canônica; não cria coluna ou tabela.

| Protocolo | `preserve` | `explore` | Rótulo dos outputs |
| --- | --- | --- | --- |
| Peça única | fatos verificados, requisitos da marca e, conforme o `treatment`, identidade, reconhecibilidade, aplicação exata ou presença obrigatória da referência | composição, hierarquia, nova execução e, conforme o `treatment`, linguagem visual ou direção de estilo da referência | `Peça única` |
| Variações | requisitos da marca e conteúdo/identidade visual conforme o uso escolhido da arte-base | composição, hierarquia, linguagem visual e nova execução | rótulo congelado de cada direção |
| Adaptar formatos | conteúdo, identidade visual e requisitos da marca | layout por formato | formato de destino |
| Mudar estilo | conteúdo da arte original e requisitos da autoridade de marca resolvida | linguagem visual da referência, composição e hierarquia | `Novo estilo` |

Em Peça única, a projeção deriva cada referência do `treatment` congelado: `identity_preservation`, `recognizable_preservation`, `exact_application` e `required_presence` entram em `preserve`; `visual_language` e `style_direction` entram em `explore`. A UI combina a chave com o rótulo da fonte correspondente. A mera presença de uma referência nunca é traduzida como identidade a preservar.

Chaves sem evidência correspondente são omitidas. Por exemplo, `piece_reference_identity` aparece somente para uma referência com `identity_preservation`; uma textura com `visual_language` aparece somente em `explore`.

`prepare` devolve a projeção. O GET do Trabalho a reconstrói após reload enquanto existe um `inputSnapshot` preparado válido. `preparedRevision` corresponde ao `updatedAt` persistido pela preparação e vincula a confirmação ao snapshot exato.

A apresentação humana é:

```text
Objetivo        Criar 3 variações
Arte            Conteúdo + estilo
Preservar       Logo, textos, oferta e produto
Explorar        Composição, hierarquia e linguagem visual
Formato         4:5
Ajustes         Revisar
```

Quantidade e formatos permanecem visíveis. Nenhum valor de créditos por operação é mostrado.

Alterar pedido, fonte, papel, direção ou formato dentro do mesmo Rascunho limpa o `inputSnapshot`, remove a projeção preparada e exige **Continuar** novamente. Trocar de objetivo não altera esse plano: salva o Rascunho atual e cria ou abre outro Rascunho no novo Protocolo, conforme a seção 9.

### 7.5 Confirmação

O CTA final é **Confirmar e gerar**.

Pressionar Enter nunca confirma geração. A confirmação é uma ação explícita de botão.

O cliente envia `preparedRevision`, e o servidor a compara sob o mesmo lock usado para confirmar a geração. Revisão divergente retorna `stale_input`, não gera e volta ao plano atualizado. O servidor também revalida snapshot, marca, materiais, identidade, saldo e idempotência. Saldo insuficiente não inicia job e mostra:

```text
Créditos insuficientes
[Obter créditos]
```

O Trabalho preparado permanece intacto e retomável.

## 8. Resultados e iteração

Quando a geração começa, o mesmo Trabalho muda de fase. O composer e o plano ficam recolhidos, enquanto progresso e resultados assumem o foco.

A ordem da tela passa a ser:

1. nome, marca e estado do Trabalho;
2. `Plano usado`, recolhido;
3. progresso individual;
4. grid de peças;
5. associação opcional a campanha.

### 8.1 Progresso parcial

Peças aparecem assim que ficam prontas:

```text
Variação 1     pronta
Variação 2     gerando
Variação 3     falhou · tentar novamente
```

Uma falha não bloqueia peças prontas. Retry atua somente sobre a saída que falhou.

### 8.2 Ações de peça

Cada peça pronta oferece:

- Refinar;
- Aprovar;
- Baixar;
- Separar camadas, quando disponível;
- menu secundário para ações menos frequentes já existentes.

Todas as peças já estão salvas. Selecionar ou aprovar não controla persistência.

### 8.3 Refinamento e versões

`Refinar` abre na própria peça:

```text
O que você quer mudar?
[Instrução]
[Anexo opcional]
[Gerar nova versão]
```

A nova versão:

- referencia exatamente a peça usada como base;
- nunca sobrescreve a versão anterior;
- torna-se a versão em trabalho;
- não é aprovada automaticamente.

Quando existem versões, `Versões (n)` abre o histórico. `Comparar` aparece somente quando há pelo menos duas versões e compara a atual com uma anterior escolhida. Histórico e comparação não ficam permanentemente expandidos.

Histórico e comparação são uma nova capacidade de apresentação desta entrega. O grid principal continua mostrando apenas a versão mais recente de cada linhagem, mas preserva os ancestrais recebidos no detalhe do Trabalho para a gaveta `Versões`.

A gaveta lista thumbnail, número da versão, data e instrução de refinamento. `Comparar` abre somente duas imagens lado a lado — versão atual e uma ancestral selecionada. Não há diff de pixels, slider, nova persistência ou endpoint de comparação.

## 9. Estado, autosave e troca de objetivo

Após a escolha do objetivo:

- pedido, Protocolo, fontes, papéis, extrações e ajustes são salvos automaticamente;
- a URL recebe o identificador do Trabalho;
- fechar e reabrir restaura o estado persistido;
- geração continua no servidor se a aba fechar;
- retomada abre a próxima ação real.

Trocar de objetivo depois da criação do Rascunho não converte o registro atual. A interface informa:

> Este objetivo começa outro rascunho. O trabalho atual continuará salvo.

Materiais compatíveis podem ser reaproveitados pelo comportamento canônico existente. Configurações específicas, direções e planos não atravessam Protocolos silenciosamente.

## 10. Arquitetura técnica

### 10.1 Responsabilidades existentes

- `DashboardHomeActions` continua compondo cabeçalho, retomada, campanha, composer e referências.
- `useCreativeComposer` continua sendo o controller da jornada.
- `CreativeComposer` continua apresentando entrada, fontes, objetivo e ajustes.
- `CreativeProposalGrid` e `CreativeResultCard` continuam apresentando outputs, retry, aprovação e refinamento.
- Uma apresentação focada de histórico/compare passa a consumir as versões ancestrais que o detalhe do Trabalho já retorna; ela não cria contrato de persistência novo.
- As aplicações canônicas de draft, fonte, preparação, geração, campanha e revisão continuam sendo as únicas implementações de negócio.

### 10.2 Mudança do controller

O controller separa duas intenções hoje encadeadas:

```text
preparePlan()
  → persiste alterações
  → chama prepare
  → apresenta snapshot preparado

confirmGeneration()
  → envia preparedRevision
  → valida o snapshot preparado atual sob lock
  → chama generate
```

Não haverá chamada a `generate` dentro de `preparePlan`.

O response público de `prepare` e o detalhe GET do Trabalho passam a expor `preparedPlan: PreparedPlanProjectionV1 | null`. O GET não expõe o `inputSnapshot` bruto. A projeção é `null` para snapshots legados que não possam ser validados com segurança.

### 10.3 Etapa derivada

Não será criada uma segunda máquina de estados persistida. A etapa visível é derivada do estado canônico:

```text
sem objetivo                         → entrada
draft + !preparedPlan                → preparação
draft + preparedPlan                 → revisão do plano
ready + zero outputs                 → confirmação
outputs queued/processing            → geração
ao menos um output terminal          → revisão ou recuperação
```

`draft + !preparedPlan` cobre tanto fontes ausentes, pendentes ou falhas quanto texto-only e fontes prontas ainda não preparadas. `ready + zero outputs` volta ao plano confirmado: saldo insuficiente aparece ali sem mudar o estado canônico. Se a última submissão tiver resultado de rede incerto, o controller mantém o CTA bloqueado nessa mesma etapa até o GET/reconciliação determinar se há outputs ou se é seguro tentar novamente.

`preparedPlan` só existe quando há `inputSnapshot` atual e projetável. Autosave ou mutação de fonte que invalidar a preparação limpa o snapshot canônico; não existe status persistido `prepared` paralelo. Falhas terminais sem peça pronta continuam na superfície de resultados, com recuperação, e não devolvem o usuário à configuração.

### 10.4 Compatibilidade

- URLs antigas com `studioMode` ou intenção continuam resolvendo para o objetivo correspondente.
- O seletor visual antigo não é renderizado.
- Links com `workId` continuam abrindo o Trabalho e sua etapa real.
- Templates, Quick Tools, campanha e retomada preenchem ou abrem o mesmo composer.

### 10.5 Campanha secundária

O diálogo `Nova campanha` usa o POST `/api/campaigns` existente com `name`, nome da marca como `client` e `clientProfileId`. Nenhum campo novo é adicionado ao endpoint.

- com `workId`, o sucesso chama o vínculo canônico de campanha;
- sem `workId`, o Estúdio mantém `campaignId` validado na URL até a criação do Rascunho e então executa o mesmo vínculo;
- campanha de outra marca ou workspace é rejeitada pela validação existente;
- cancelar ou falhar não cria nem altera Trabalho.

## 11. Estados de erro e recuperação

Erros aparecem junto ao objeto afetado:

| Falha | Comportamento |
| --- | --- |
| Seleção incompatível | Abre o input exigido e explica o requisito |
| Upload | Mantém pedido e demais arquivos; oferece retry ou remoção |
| Análise | Mantém arquivo e Trabalho; oferece retry |
| Preparação | Preserva tudo e permite continuar após correção |
| Saldo insuficiente | Não gera; preserva o plano e oferece obter créditos |
| Uma saída | Mostra as prontas e permite retry somente da falha |
| Rede ou aba fechada | Reconstrói estado persistido ao retornar |
| Conflito de marca | Não reatribui Trabalho nem fonte silenciosamente |
| Geração incerta | Reconcilia o estado real antes de oferecer nova tentativa |

Termos internos como dispatch, settlement e reconciliation não aparecem. Estados operacionais continuam explícitos:

```text
Preparando materiais
Analisando a arte
Pronto para gerar
Criando as peças
2 de 3 prontas
Não foi possível concluir uma peça
```

## 12. Acessibilidade e responsividade

- Texto, upload e objetivo são utilizáveis por teclado.
- Drag-and-drop sempre possui alternativa por botão.
- Cards usam botões reais e `aria-pressed` quando selecionáveis.
- Alterações de upload, análise e geração usam `aria-live` sem anunciar cada atualização de polling.
- Foco segue a próxima decisão revelada e retorna ao acionador ao fechar a gaveta.
- Geração paga exige clique explícito; Enter não a confirma.
- Ações essenciais nunca dependem exclusivamente de hover.
- Em mobile, objetivos usam duas colunas ou lista; plano e resultados usam uma coluna quando necessário.
- O plano recolhido continua acessível por teclado e leitor de tela durante revisão.

## 13. Telemetria de produto

O funil canônico permanece fechado e usa seus nomes existentes:

| Momento do Estúdio | Evento canônico |
| --- | --- |
| objetivo cria o Rascunho | `creative_work_started` |
| plano preparado fica disponível | `briefing_ready` |
| geração é aceita pelo servidor | `generation_confirmed` |
| primeira peça fica pronta | `output_ready` |
| usuário revisa ou refina | `creative_work_reviewed` |
| usuário aprova | `creative_work_approved` |
| Trabalho é retomado | `creative_work_reopened` |

Interações necessárias para avaliar a UI, inclusive antes de existir `workId`, entram no mecanismo beta-analytics existente como eventos **UI-only** e nunca contam novamente no funil canônico:

- `studio_entry_started`;
- `studio_goal_selected`;
- `studio_source_role_selected`;
- `studio_plan_shown`;
- `studio_plan_changed`;
- `studio_plan_confirmed`;
- `studio_refinement_started`.

No primeiro mount do Estúdio, o cliente cria um UUID `studioSessionId` e o mantém em `sessionStorage` por até 24 horas, rotacionando-o ao trocar de workspace ou vencer a janela. Esse valor é uma propriedade permitida dos eventos, não o campo `sessionId` ligado à tabela owner-only `beta_sessions`. A experiência atual recebe a mesma instrumentação antes do baseline.

Depois da criação do Rascunho, os eventos também carregam `creativeWorkId` como propriedade. A lista permitida do beta-analytics é estendida somente com `studioSessionId`, `creativeWorkId`, `inputMode`, `protocol`, `sourceRole`, `rolloutVariant` e `outputCount`; não há nova tabela nem migração de coluna.

O clique em **Gerar** não emite `generation_confirmed`. O servidor emite o evento canônico, e o cliente emite `studio_plan_confirmed`, somente depois que o settlement aceita a geração e cria/reserva os outputs. Bloqueio de saldo, `stale_input`, falha de dispatch ou resposta incerta não avançam o funil.

Os eventos carregam somente IDs, origem, Protocolo, contagens, formatos, estados e timestamps necessários à análise. A cotação interna permanece nos eventos financeiros autorizados, embora não seja exibida na interface.

Métricas principais:

- conclusão por origem;
- tempo até a preparação;
- tempo até o plano visível, diagnóstico exclusivo do tratamento;
- abandono antes da geração;
- troca de objetivo;
- correção do papel de fontes;
- falha por estágio;
- retomada bem-sucedida;
- refinamento iniciado;
- débito, compensação e refund por geração.

## 14. Testes e critérios de aceite

### 14.1 Testes automatizados

1. Entrada por texto, arquivo e combinação dos dois.
2. Nenhum Rascunho criado antes da escolha do objetivo.
3. Arquivo em buffer inicia upload depois da escolha.
4. Links antigos resolvem para o mesmo Protocolo sem renderizar o seletor antigo.
5. Troca de objetivo preserva o Rascunho anterior.
6. Matriz de materiais aplica papéis e cardinalidades por Protocolo.
7. Retry e remoção atuam somente sobre a fonte afetada.
8. `prepare` não cria job, débito nem chamada ao provider de imagem.
9. `preparedPlan` é determinístico, omite o snapshot bruto e reaparece após reload.
10. Alteração do Rascunho invalida plano anterior.
11. `preparedRevision` divergente bloqueia confirmação como `stale_input`.
12. Confirmação válida é idempotente.
13. Falha parcial não bloqueia peças prontas.
14. Refinamento cria descendente e preserva a versão anterior.
15. Histórico lista ancestrais e comparação mostra exatamente duas versões sem novo endpoint.
16. Gaveta usa somente catálogo curado e seu CTA seleciona Restyle explicitamente.
17. Diálogo cria campanha real e associa somente após sucesso.
18. Nenhum valor de custo por operação é renderizado.
19. Saldo global e bloqueio por insuficiência continuam funcionando.
20. Matriz de etapas cobre draft sem plano, confirmação sem outputs, geração e resultados terminais.
21. Eventos UI-only usam `studioSessionId` sem exigir registro em `beta_sessions` e não duplicam o funil canônico.
22. `generation_confirmed` e `studio_plan_confirmed` só aparecem após aceitação server-side.
23. Atribuição percentual permanece estável por workspace.
24. Teclado, foco, anúncios e ordem semântica funcionam em mobile e desktop.

Os E2Es funcionais precisam entrar no gate de CI e deixar de depender de números antigos exibidos na UI. Os testes verificam débito e refund pelas interfaces internas autorizadas, não por texto de preço na tela.

### 14.2 Teste humano

Executar 10 participantes em três tarefas cada, cobrindo pelo menos três marcas e dois segmentos:

1. criar uma peça apenas por texto;
2. criar variações a partir de uma arte;
3. refinar uma peça e reencontrar a versão anterior.

Critérios de aprovação:

- pelo menos 8 de 10 concluem cada uma das três tarefas usando somente o enunciado da tarefa, sem instrução de interface;
- pelo menos 9 de 10 passam na verificação de compreensão antes da geração;
- ninguém precisa escolher o mesmo objetivo duas vezes;
- 10 de 10 conseguem retomar após reload no cenário de retomada;
- nenhuma geração começa antes de confirmação explícita;
- saldo insuficiente preserva integralmente o Trabalho.

A verificação de compreensão faz duas perguntas, sem mostrar o plano durante a resposta:

1. O que deve permanecer igual?
2. O que o ADScale pode mudar?

Passa quem identifica pelo menos dois elementos presentes em `preserve` e um elemento presente em `explore`, sem atribuir ao plano uma mudança contraditória.

### 14.3 Definições das métricas

- **Sessão elegível:** `studio_entry_started` único por `studioSessionId`, workspace e janela de 24 horas.
- **Conclusão:** pelo menos um `output_ready` no mesmo Trabalho em até 24 horas após a entrada.
- **Abandono antes da geração:** ausência de `generation_confirmed` em até 24 horas após a entrada.
- **Troca de objetivo:** segundo `studio_goal_selected` na mesma sessão depois de um Rascunho já criado.
- **Retomada bem-sucedida:** `creative_work_reopened` seguido da próxima etapa canônica em até 30 minutos.
- **Taxa de falha:** gerações confirmadas com terminal `creative_work_failed` divididas por gerações confirmadas.
- **Taxa de refund:** gerações confirmadas com refund terminal divididas por gerações confirmadas.
- **Tempo até a preparação:** intervalo entre `studio_entry_started` e `briefing_ready`; é comparável entre tratamento e controle.
- **Tempo até o plano visível:** intervalo entre `studio_entry_started` e `studio_plan_shown`; é observado apenas no tratamento e não participa da decisão contra o controle.

O baseline é congelado usando os 14 dias anteriores ao rollout e no mínimo 30 sessões elegíveis. Se 14 dias não atingirem 30 sessões, a janela é estendida até atingir esse denominador.

Comparar com o baseline e, durante rollout parcial, com o controle concorrente:

- tempo até a preparação;
- abandono antes da geração;
- trocas de objetivo;
- erros de papel das fontes;
- refinamentos iniciados;
- retomadas concluídas.

## 15. Rollout e rollback

1. Instrumentar a experiência atual e congelar o baseline definido na seção 14.3.
2. Entregar o Estúdio progressivo atrás de um único percentual de rollout determinístico por workspace, inicialmente em zero.
3. Concluir os 10 testes humanos e corrigir os três maiores breakpoints antes de tráfego externo.
4. Liberar 10% por no mínimo sete dias, 30 sessões elegíveis e 20 gerações confirmadas no tratamento, com pelo menos os mesmos denominadores no controle concorrente.
5. Liberar 50% por no mínimo sete dias, 60 sessões elegíveis e 40 gerações confirmadas em cada braço.
6. Liberar 100% somente depois de o estágio de 50% acumular no mínimo 14 dias, 100 sessões elegíveis e 75 gerações confirmadas em cada braço.
7. Observar 100% por 14 dias e então remover interface antiga e parâmetro de rollout.

O rollout usa um único valor configurável, não um novo framework de feature flags. A alocação por workspace permanece estável entre sessões. Todos os mínimos acima são por braço, nunca o total combinado; uma geração só entra no denominador quando está ligada a uma sessão elegível do mesmo braço.

Cada avanço exige simultaneamente:

- conclusão não mais que cinco pontos percentuais abaixo do controle concorrente;
- abandono não mais que cinco pontos percentuais acima do controle;
- falha e refund não mais que meio ponto percentual acima do controle;
- nenhum incidente crítico listado abaixo.

Se o volume mínimo não for atingido, o estágio permanece ativo até atingir o denominador; tempo sozinho não autoriza avanço. Em 100%, o baseline congelado substitui o controle concorrente.

Rollback imediato se ocorrer:

- perda de Rascunho, fonte, output ou versão;
- geração antes da confirmação;
- cobrança duplicada;
- divergência entre job, débito, compensação e refund;
- queda superior a cinco pontos percentuais na conclusão;
- aumento superior a meio ponto percentual em falha ou refund contra o controle.

## 16. Riscos e trade-offs aceitos

### 16.1 Créditos não exibidos por operação

Remover estimativas reduz ruído transacional, mas também reduz a previsibilidade do gasto. Essa é uma decisão explícita do owner. O plano mitiga o risco mantendo saldo global, bloqueio por insuficiência, auditoria interna e monitoramento de débito, refund, suporte e abandono.

### 16.2 Buffer anterior ao objetivo

Evitar um Protocolo silencioso preserva o domínio, mas cria um curto estado não retomável antes da escolha. O composer reduz esse intervalo revelando os objetivos imediatamente. Não será criada persistência paralela apenas para esse momento.

### 16.3 Estúdio substitui Início

O termo é mais específico para criação, mas contradiz o vocabulário canônico atual. A implementação deve atualizar documentação, navegação, traduções e testes na mesma mudança para não manter dois nomes.

### 16.4 Roteador adiado

O objetivo explícito mantém uma decisão humana. Um roteador só será considerado como subprojeto separado se o fluxo aprovado ainda demonstrar abandono relevante e existir corpus suficiente para medir confiança, correção e custo dos erros.

## 17. Definição de pronto

O Estúdio progressivo está pronto quando:

- todas as entradas chegam ao mesmo Trabalho canônico;
- a duplicidade `Com arte / Com briefing` deixou de existir;
- objetivo aparece após a primeira entrada e cria o Rascunho correto;
- preparação e geração estão separadas;
- nenhuma operação mostra custo por ação;
- resultados substituem visualmente a configuração sem criar outra superfície de domínio;
- drafts, falhas parciais e versões são recuperáveis;
- testes automatizados e gate humano passam;
- rollout chega a 100% sem critérios de rollback;
- interface antiga, flag temporária e caminhos mortos são removidos.
