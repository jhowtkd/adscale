# Design: Recuperação de qualidade do Creative Work

> **Data:** 2026-07-22
> **Status:** Aprovado no brainstorming
> **Escopo:** Protocolos de criação da Home sobre o agregado `creative_work`
> **Abordagem:** Retrofit canônico por protocolo
> **Decisor:** Jhonatan Soares

---

## 1. Objetivo

Recuperar o diferencial criativo do AdScale nos quatro protocolos da Home sem criar outro pipeline ou jornada paralela:

- Peça única;
- Variações;
- Adaptar formatos;
- Mudar estilo.

O resultado deve preservar fatos, marca e intenção, entregar comportamentos realmente diferentes por protocolo e remover chamadas ocultas que hoje aumentam latência sem melhorar a peça.

Esta especificação itera sobre o [ADR 0013](../../adr/0013-trabalho-criativo-first.md). O agregado `creative_work`, sua API, seus jobs, sua cobrança e sua persistência continuam canônicos.

## 2. Problema confirmado

O produto apresenta quatro protocolos, mas o executor atual envia todo Creative Work inicial como `social_post`. O executor converte esse modo para `art_variation`, cria três rotas internas, escolhe uma e tenta um refinement de alta qualidade.

Esse colapso produz cinco falhas encadeadas:

1. Peça única, Variações, Adaptar formatos e Mudar estilo executam quase o mesmo comportamento.
2. Variações materializa três outputs visíveis, mas cada output ainda gera três candidatos ocultos.
3. O pedido pode ser reduzido a um título de 80 caracteres antes da criação da copy.
4. Conteúdo, estilo e identidade disputam um limite único de referências sem autoridade suficientemente explícita.
5. O refinement acrescenta até 300 segundos e falhou nas cinco execuções produtivas observadas.

O QA atual ainda pode atribuir score alto a uma peça que perdeu fatos ou inventou alegações. A última evidência humana anterior ao harness v2 terminou em `FAIL` por duas regressões objetivas, e o harness v2 não recebeu um novo benchmark visual completo antes do release.

## 3. Metas

1. Dar a cada protocolo um contrato de geração próprio sobre o mesmo executor canônico.
2. Preservar integralmente o pedido e a origem dos fatos.
3. Separar autoridade de conteúdo, estilo e marca.
4. Reservar retry automático para falhas objetivas ou de transporte.
5. Limitar cada output a duas chamadas de imagem.
6. Entregar p95 de até 4 minutos por output e 8 minutos por lote de três.
7. Passar o Gate 8 do ADR 0013 antes da liberação geral.

## 4. Não objetivos

- alterar Goal Agent ou o Assistente;
- trocar MiniMax por OpenAI;
- modificar derivações de campanhas;
- adicionar outro provider ou modelo de imagem;
- implantar worker dedicado nesta primeira especificação;
- criar dashboard ou relatório diário;
- adicionar controles de CTA, paleta ou fidelity à interface;
- reformular Brand Training;
- criar persistência ou pipeline paralelo.

## 5. Princípios obrigatórios

1. Um comportamento de negócio possui uma implementação canônica.
2. Qualidade confiável vence velocidade e custo, mas trabalho sem valor deve ser removido.
3. A IA pode inferir decisões visuais; não pode inventar fatos comerciais ou institucionais.
4. Um score subjetivo nunca encobre uma falha objetiva.
5. Resultado parcial é resultado: uma saída falha sem apagar as demais.
6. Uma correção automática não gera cobrança adicional.
7. Nenhuma capacidade nova entra antes de uma medição provar que o retrofit não basta.

## 6. Arquitetura

### 6.1 Limite da mudança

A implementação permanece no fluxo:

```text
CreativeComposer
  → /api/creative-work
  → creative_work aggregate
  → creativeWorkOutputJob
  → executeCanonicalGeneration
  → OpenAIImageProvider
```

Não serão criadas classes de executor por protocolo. Uma tradução pura de `toolKind` resolve o modo canônico e o comportamento associado. O executor continua único; modo, fact pack e papéis das referências determinam prompt, quantidade de chamadas e QA.

### 6.2 Contratos dos protocolos

| Protocolo | Modo canônico | Outputs visíveis | Execução normal | Autoridade principal |
| --- | --- | ---: | --- | --- |
| Peça única | `social_post` | 1 | uma chamada direta em alta qualidade | pedido + marca ativa |
| Variações | `art_variation` | 3 | uma chamada direta para `conservative`, `balanced` e `bold` | mesmo fact pack para as três direções |
| Adaptar formatos | `format_adaptation` | um por formato | uma chamada por proporção | arte original |
| Mudar estilo | `restyling` | 1 | uma chamada com conteúdo e estilo separados | escolha de marca resolvida |
| Revisão | `creative_revision` | 1 nova versão | uma chamada ligada ao output anterior | instrução de revisão + contrato original |

O route planner, o judge e os candidatos internos deixam de ser invocados implicitamente pelo executor para Creative Work. Seus módulos permanecem no repositório porque outras superfícies ainda podem depender deles; esta entrega não cria uma nova interface para solicitá-los.

### 6.3 Variações sem torneio oculto

`quoteCreativeWork` já cria três outputs persistidos para Variações. Esses outputs são as três direções que o usuário compara. Cada direção usa o `creativeLevel` persistido e uma chamada de imagem própria.

Não haverá outro conjunto de três candidatos dentro de cada output. Se o Gate 8 mostrar que os três níveis continuam visualmente indistinguíveis, uma futura especificação poderá introduzir planejamento textual compartilhado. Essa complexidade não entra antes da evidência.

## 7. Contexto e verdade factual

### 7.1 Fact pack persistido

O `CreativeWorkInputSnapshot` continua sendo o snapshot canônico e recebe um bloco opcional `factPack`, sem nova coluna de banco. Linhas antigas permanecem válidas.

O bloco contém:

- pedido integral do usuário;
- fatos extraídos do pedido;
- fatos extraídos de todas as fontes com papel `content` ou `both`;
- elementos obrigatórios e proibidos da marca autorizada;
- origem de cada fato (`request`, `source` ou `brand`);
- identidade de marca resolvida para a execução.

O fact pack é uma projeção auditável. Pedido, análises e snapshot de marca continuam sendo as fontes de verdade.

### 7.2 Política de inferência

A IA pode inferir:

- composição;
- atmosfera;
- hierarquia;
- tratamento tipográfico;
- direção de arte;
- escolhas decorativas.

A IA não pode inventar:

- preço ou desconto;
- data ou prazo;
- modalidade;
- benefício ou prova;
- garantia;
- condição comercial;
- credencial institucional;
- marca, produto ou serviço.

Informação ausente permanece ausente. O sistema não substitui lacunas por valores genéricos como “Público da marca”.

### 7.3 Briefing e copy

O preparo usa o pedido completo e todas as análises de conteúdo. `deriveCreativeWorkTitle` continua servindo apenas ao título visual do trabalho e nunca alimenta a verdade factual.

A copy é gerada a partir do fact pack. Antes da geração de imagem, uma validação textual estruturada rejeita ou reescreve alegações sem origem. Essa correção de texto não consome chamada de imagem.

## 8. Papéis das referências

Referências obrigatórias entram antes de assets opcionais e nunca podem ser expulsas pelo limite do provider.

### 8.1 Peça única

- marca ativa fornece identidade e restrições;
- fonte opcional fornece conteúdo ou direção visual conforme seu papel;
- ausência de fonte visual não bloqueia pedido textual.

### 8.2 Variações

- as três direções compartilham o mesmo fact pack e a mesma autoridade de marca;
- uma fonte `content` preserva fatos e assunto;
- uma fonte `style` influencia somente linguagem visual.

### 8.3 Adaptar formatos

- a arte original é obrigatória e ocupa a primeira posição;
- marca, fatos, texto essencial, conceito e direção visual são preservados;
- somente composição, escala e distribuição espacial mudam;
- o modo não pode cair para geração sem referência.

### 8.4 Mudar estilo

- uma fonte de conteúdo e uma fonte de estilo são obrigatórias;
- conteúdo preserva fatos, assunto e elementos essenciais;
- estilo transfere paleta, tipografia, textura, luz, ritmo e atmosfera;
- a referência de estilo nunca transfere marca, produto, copy ou anúncio completo.

Quando a análise identificar uma marca na arte original diferente da marca ativa, a geração fica bloqueada por uma escolha curta:

- preservar a marca da arte original; ou
- converter para a marca ativa.

Sem conflito detectado, a marca ativa é usada e o fluxo segue sem pergunta. A escolha é persistida em `CreativeWorkSettings` como campo opcional, sem nova tabela.

## 9. QA e decisão de qualidade

### 9.1 Falhas objetivas

São bloqueantes:

- fato obrigatório ausente ou alterado;
- alegação sem origem;
- marca, logo, produto ou serviço incorretos;
- contaminação factual da referência de estilo;
- referência obrigatória ignorada;
- formato ou dimensões incorretos;
- arquivo corrompido ou inutilizável;
- texto factual escolhido pelo output, mas ilegível ou severamente cortado.

O QA deve produzir códigos estruturados. Um score numérico ou uma justificativa subjetiva não pode converter falha objetiva em aprovação.

### 9.2 Avaliação subjetiva

Composição, impacto, originalidade, ritmo, densidade, CTA e aparência genérica permanecem como sinais de comparação e aprendizado humano. Não disparam retry automático nesta entrega.

Se a avaliação subjetiva falhar tecnicamente, a imagem continua disponível sem score subjetivo.

O veredito objetivo pode ser `pass`, `fail` ou `inconclusive`. Somente `fail` confirmado usa a tentativa corretiva. `Inconclusive` mantém o output disponível com sinal de revisão, não dispara retry e não conta como aprovação objetiva no Gate 8.

## 10. Retry, erros e créditos

Cada output possui teto absoluto de duas chamadas de imagem:

1. geração normal;
2. uma segunda chamada usada para retry de transporte ou correção objetiva, nunca para ambos.

A correção objetiva parte novamente das fontes originais, do modo correto e do fact pack. Ela acrescenta apenas o código e a instrução cirúrgica da falha. Não usa refinement genérico sobre o output anterior.

Política de cobrança:

- uma cobrança por output planejado;
- retry ou correção não cobra crédito adicional;
- falha após a segunda chamada gera refund idempotente do output;
- outputs concluídos no mesmo lote permanecem cobrados e disponíveis;
- conclusão tardia depois de perda de lease é descartada e não altera billing.

A UI diferencia timeout, contexto inválido, violação factual, conflito de marca, falha de referência e falha desconhecida. Retry manual atua somente sobre o output falho.

## 11. Estados e experiência

O ciclo persistido permanece:

```text
draft → ready → generating → partial|completed|failed
```

Cada output mantém:

```text
queued → processing → completed|failed
```

O endpoint de geração continua respondendo `202`; o job continua no servidor quando a aba fecha; a Home reconstrói o estado por polling. Não haverá nova infraestrutura de realtime nesta entrega.

A única nova decisão visível é o conflito de marca no restyle. Todos os demais contratos são inferidos e executados sem adicionar wizard.

Os eventos `output_learning_recommendation_viewed`, `dismissed`, `accepted` e `edited` entram na taxonomia com seus nomes próprios e propriedades permitidas. Eles não são renomeados para `next_experiment_*`.

## 12. Desempenho e capacidade

### 12.1 Orçamento de chamadas

| Protocolo | Normal | Máximo excepcional |
| --- | ---: | ---: |
| Peça única | 1 | 2 |
| Variações | 3 | 6 |
| Adaptar três formatos | 3 | 6 |
| Mudar estilo | 1 | 2 |
| Revisão de output | 1 | 2 |

O web starter mantém concorrência de imagem igual a 1 inicialmente. Referências são normalizadas para tamanho e pixels seguros, buffers são liberados após upload e o cache do Sharp permanece desabilitado.

### 12.2 Metas bloqueantes

- p95 de até 4 minutos por output;
- p95 de até 8 minutos por lote de três;
- RSS do web abaixo de aproximadamente 358 MB;
- zero refinement automático;
- nenhum output excede duas chamadas de imagem.

### 12.3 Upgrade condicional

Da branch `codex/imagegen-stabilize-accelerate`, somente mudanças pequenas e verificadas podem ser extraídas:

- timeout único no SDK e `maxRetries: 0`;
- heartbeat por etapa;
- normalização de referências;
- refund idempotente;
- descarte de conclusão tardia;
- cancelamento após perda de lease.

O worker dedicado de 2 GB pertence a uma especificação posterior. Ele só será proposto se o retrofit correto ainda falhar nas metas de tempo ou memória.

## 13. Rollout e rollback

1. Rodar testes unitários, integração e E2E com provider determinístico.
2. Implantar o novo roteamento atrás de um switch temporário e reversível.
3. Executar um output controlado.
4. Executar um lote controlado de três outputs.
5. Executar o Gate 8 completo.
6. Liberar o novo roteamento e remover o switch temporário.

O switch existe somente para rollout e deve ser removido após o Gate 8. Rollback desativa o novo roteamento para novos trabalhos; outputs em andamento terminam sob o contrato congelado no snapshot.

Testes produtivos que consumam créditos exigem orçamento explícito e aprovação separada antes da execução.

## 14. Estratégia de testes

### 14.1 Unitários

1. Cada `toolKind` resolve o modo canônico correto.
2. `quoteCreativeWork` preserva quantidade de outputs e cobrança.
3. O pedido integral chega ao fact pack sem truncamento.
4. Todas as fontes de conteúdo participam do fact pack.
5. Referências obrigatórias permanecem dentro do limite.
6. Conflito de marca exige escolha; ausência de conflito segue direto.
7. Falha objetiva anula score subjetivo alto.
8. Veredito inconclusivo preserva o output, não dispara retry e não passa no Gate 8.
9. Falha subjetiva não dispara retry.
10. O teto de duas chamadas é respeitado.
11. Refund é idempotente e específico por output.
12. Eventos de analytics passam pela allowlist.

### 14.2 Integração

Cobrir `draft → prepare → charge → enqueue → generate → QA → complete|refund` para os quatro protocolos, validando:

- modo enviado ao provider;
- quantidade de chamadas;
- dimensões;
- papéis e ordem das referências;
- comportamento da correção automática;
- persistência de lote parcial;
- reconstrução por polling.

### 14.3 E2E determinístico

- Peça única textual não exige análise visual.
- Variações mostra exatamente três direções persistidas.
- Adaptação entrega cada formato independentemente.
- Restyle pergunta autoridade de marca apenas em conflito.
- Fechar e reabrir a Home não perde geração.
- Retry manual não duplica cobrança ou output.

## 15. Gate 8 humano

O release geral exige 10 jornadas completas, 3 marcas e 2 segmentos, incluindo obrigatoriamente:

- Psicologia: preservar “agosto” e “vagas limitadas”, sem alegações inventadas;
- XTB: separar conteúdo, estilo e identidade;
- NR1: adaptar a mesma peça para os três formatos.

Cada caso é comparado de forma cega entre:

1. snapshot da produção atual;
2. geração direta sem harness;
3. novo Creative Work.

Critérios:

- zero regressões factuais, de marca ou dimensão;
- 100% dos outputs planejados em estado terminal coerente;
- pelo menos 60% de preferência humana sobre cada baseline;
- nenhum protocolo abaixo de 50% de preferência;
- metas de p95 e memória cumpridas;
- falhas, chamadas e refunds conferidos no Postgres.

Uma preferência estética alta não compensa regressão objetiva. Se qualquer critério falhar, o switch permanece restrito e o caso é corrigido antes de nova rodada.

## 16. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| QA objetivo falso-positivo | `inconclusive` não dispara retry; mantém evidência para revisão humana |
| QA objetivo falso-negativo | Gate 8 e casos reais cobrem fatos e marcas críticos |
| Três variações ainda semelhantes | medir no Gate 8; planner compartilhado só entra com evidência |
| Retry exceder latência | teto total de duas chamadas por output |
| Fonte obrigatória exceder limite | reservar slots obrigatórios antes de assets opcionais |
| Switch temporário virar dívida | remoção faz parte do critério de release geral |

## 17. Critérios de aceite

- Os quatro protocolos enviam modos canônicos diferentes e observáveis.
- Peça única e restyle usam uma chamada normal; Variações e lote de formatos usam uma por output visível.
- Pedido, fatos e fontes permanecem rastreáveis até o QA.
- Nenhum fato sem origem entra na copy ou no output aprovado.
- Adaptação preserva a mesma peça em outra proporção.
- Restyle transfere linguagem visual sem contaminar conteúdo ou marca.
- Falha objetiva recebe no máximo uma correção e nunca cobra crédito adicional.
- Falha subjetiva não cria loop automático.
- Resultado parcial, refund e retry funcionam por output.
- Metas de tempo e memória são cumpridas.
- Gate 8 completo passa antes da liberação geral.
- Nenhuma mudança fora do escopo é necessária para concluir a entrega.
