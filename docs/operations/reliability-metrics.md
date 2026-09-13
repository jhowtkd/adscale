# Métricas de confiabilidade (baseline por SHA)

> Nota de escopo: este arquivo foi criado pela Task 18 (PR-06) com a seção
> "Settlement: oito laços"; a Task 8 (PR-02) acrescentou "Preparação:
> caracterização concorrente"; a Task 9 (PR-02) acrescentou "Telemetria mínima
> e baseline medido" (espera de preparação, tempo até primeira peça, erro por
> etapa, efeitos posteriores, custo operacional, amostras com
> intervalo/`n`/percentis/SHA/flags, tráfego real vs. teste). Novas tarefas
> acrescentam seções, sem reescrever as existentes.
>
> Sem amostra, escrever "não medido" — nunca zero. Tráfego real e de teste em
> seções separadas. 80 × 25 ms é soma nominal de pausas, não duração máxima.

## Preparação: caracterização concorrente (Task 8, PR-02)

Medido em 12/09/2026 contra o Postgres de teste real (`adscale-test-postgres`, schema migrado até `0095`), branch de execução `fed92864`. Fonte: `app/tests/integration/creative-work-preparation-concurrency.test.ts`, bloco "PR-02 Task 8". Reproduzir com:

```bash
cd app && DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TASK8_MEASUREMENTS_OUT=/tmp/task8.json \
  npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
```

O provedor é suspenso por promessa (`generateSocialPostCopy` mockada), então **tempo de IA e tempo de banco ficam separados**: os números abaixo medem o banco e o lock, nunca o modelo. O Trabalho semeado é `variations` com uma fonte pronta — `social_post` não serve, porque `projectPreparedPlanV1` devolve `null` para esse protocolo por design (`prepared-plan.ts:100`) e a preparação terminaria sempre em `invalid_preparation`.

| Cenário | Medição | Observado |
|---|---|---|
| Duas preparações iguais do mesmo Trabalho | chamadas ao modelo enquanto a primeira está suspensa | **1** — a segunda não alcança o modelo |
| " | segunda requisição assentou durante a suspensão? | **não** — presa no advisory lock |
| " | chamadas ao modelo no total | **1** — a segunda reaproveita o resultado persistido |
| " | resultado de ambas | `ok` / `ok` |
| Escritor curto, **mesmo** Trabalho | bloqueado durante a suspensão? | **sim** |
| " | espera medida | 205 ms na amostragem, 227 ms no total — limitada apenas pelo tempo que o teste segurou o modelo |
| Escritor curto, Trabalho **diferente** | espera | **5 ms** — passa direto |
| Pressão de pool, mesmo Trabalho | 5 escritores curtos concorrentes presos | **5 de 5**, com `max: 10` por processo |

### O que estes números estabelecem

**A inferência da spec virou fato medido.** A spec deduzia, da ordem `db.transaction → pg_advisory_xact_lock`, que requisições do mesmo Trabalho podem prender conexões enquanto esperam. Está medido: 5 de 5 escritores curtos do mesmo Trabalho ficaram presos, cada um segurando a conexão que abriu antes de pedir o lock. **Não é preciso Trabalhos distintos para pressionar o pool.**

**O dano é por Trabalho, não global.** Um escritor de outro Trabalho passou em 5 ms contra 227 ms do mesmo Trabalho. O advisory lock é escopado por `workspaceId:workItemId:prepare`, e isso delimita o raio do problema.

**Uma escrita curta espera a IA.** `withCreativeWorkPreparationLock` sobre o mesmo Trabalho não retorna enquanto o modelo não responde, embora a escrita não dependa de IA nenhuma. É o bug que o PR-05 corrige.

### Depois da Task 15 — medido em 12/09/2026, mesmo teste, mesmo banco

| Cenário | Antes (Task 8) | Depois (Task 15) |
|---|---|---|
| Escritor curto, **mesmo** Trabalho | bloqueado, 227 ms | **não bloqueia**, 214 ms sem espera |
| Edição de fonte durante modelo suspenso | bloqueava até a resposta | **8 ms** |
| Aquisição do lock durante modelo suspenso | 227 ms | **1 ms** |
| Pressão de pool, 5 escritores concorrentes | **5 de 5 presos** | **0 de 5** |
| Escritor curto, Trabalho diferente | 5 ms | 1 ms |
| **Chamadas ao provedor, duas preparações iguais** | **1** | **1** — invariante preservada |
| Segunda requisição concorrente | presa no lock | `preparation_in_progress` com `attemptId` |

A invariante que mais importava sobreviveu: **duas preparações iguais continuam produzindo uma única chamada ao provedor**. Antes era efeito colateral da serialização pelo lock; agora é deliberada, via `claimPreparationAttempt` devolvendo `joined`. O gasto com o provedor não dobrou, que era o risco.

Os três cenários de caracterização da Task 8 foram **invertidos**, não removidos: cada um passou a afirmar o oposto, que é exatamente o que a correção produz. Os números de antes ficam nos comentários do teste como registro.

### Carrossel (Task 16) — medido em 12/09/2026

| Cenário | Antes | Depois |
|---|---|---|
| Chamadas de pesquisa ao provedor, duas requisições iguais concorrentes | **2** | **1** |
| Segunda requisição concorrente | chamava o provedor | `preparation_in_progress` |

O CAS de `persistEditorial`/`writeSettings` já protegia a **escrita** contra resultado velho; nunca protegeu o **gasto**. A tentativa cobre essa lacuna e nada mais.


### Task 16 — controles negativos e correção, 13/09/2026

Base: `93d7820b`, com correção local no wrapper e um teste unitário de exceção.
Postgres de testes: `localhost:5433/adscale_test`; provedor controlado existente.

| Controle | Resultado observado |
|---|---|
| Teste novo de exceção contra o wrapper original | Vermelho: finalize chamado 0 vezes |
| Retirada temporária só da releitura em `persistEditorial` | Verde: CAS ainda impede escrita velha |
| Retirada também do predicado SQL de revisão em `updateCreativeWorkDraftIfUnchanged` | Vermelho: `result.ok` veio `true`, esperado `false` |
| Guards restaurados + fix; duas suítes unitárias e integração completa | 60/60 passaram, nenhum skip |

As mutações foram pontuais, com restauração em `finally`; não ficaram no diff.
Não houve mudança na fixture nem uso de `cas: "any"` para desligar revisão.
Comando final:

```sh
cd app
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/application/plan-carousel-work.test.ts src/server/application/prepare-carousel-work.test.ts tests/integration/creative-work-preparation-concurrency.test.ts
```

Evidência local; não inclui CI, deploy ou chamadas pagas.

### Invariante acidental que a Task 15 precisa PRESERVAR

Duas preparações iguais concorrentes produzem **uma única** chamada ao provedor. Isso não é deduplicação deliberada: é efeito colateral da serialização pelo lock — a segunda requisição só entra depois que a primeira persistiu, e então cai no atalho de reaproveitamento de snapshot.

**Ao tirar a chamada externa da transação (Task 15), essa propriedade some por construção** se nada a substituir: as duas requisições passariam a chamar o modelo em paralelo, dobrando o gasto com o provedor. É exatamente para isso que serve a tentativa persistida do PR-03 — `claimPreparationAttempt` devolvendo `joined` para a segunda requisição. O teste de Task 15 "duas requisicoes iguais compartilham UMA tentativa ativa" é o sucessor direto desta medição, e o número a bater é **1 chamada ao provedor**, o mesmo de hoje.


## Settlement: oito laços

Caracterização dos oito laços `for (… attempt < 80 …)` de
`app/src/server/generation/settlement-adapters.ts`, verificada por leitura direta
contra o SHA de execução `b2ee6511a6739e92bb074874078fe0acd88b608f` e contra o
HEAD do worktree `485a7f577d5d183a201b4a451b56e48734c4f8f2` (o arquivo é
byte-idêntico nos dois; as linhas abaixo valem em ambos).

Comando de enumeração (rodar no worktree, que contém os objetos):

```bash
git grep -n -E 'attempt[[:space:]]*<[[:space:]]*80|setTimeout' b2ee6511a6739e92bb074874078fe0acd88b608f -- app/src/server/generation/settlement-adapters.ts
```

Resultado: oito laços, nas linhas **378, 692, 818, 1068, 1397, 1664, 2284, 2658**
— exatamente a lista esperada, sem divergência.

### Convenções de leitura

- "Reads/volta" lista chamadas de repositório por iteração. Cada chamada é **no
  mínimo** 1 query; `getCreativeWork` projeta o agregado inteiro (peça + outputs
  + sources) e representa várias queries — ver a tabela medida adiante.
- `ack` = marcador durável `generation_dispatch_ack` sob a chave
  `<billingKey>:dispatch-ack` (`dispatchAckKey`, linha 108). Exigido quando o
  metadata da cobrança tem `settlementDispatchAckRequired: true`.
- Sucesso/falha/reenvio/compensação abaixo são políticas do adaptador, não
  mecânica de espera: a Task 19 pode unificar a mecânica, mas não pode mudar
  estas decisões sem mudar contrato financeiro.
- Laços textualmente parecidos NÃO têm contratos iguais: compare o laço 378 (um
  refund por output, escreve `generating` ao assentar) com o laço 1664 (refund
  único do lote, nunca escreve status de peça).

### Laço 1 — linha 378 — `creativeWorkSettlementAdapter.join` (frota: batch do Estúdio)

- Adaptador: `creativeWorkSettlementAdapter` (linha 341), método `join` (375–492).
- Reads/volta: `getCreativeWork` (agregado inteiro) + 1
  `getUsageByIdempotencyKey(batch.billingKey)` + 1
  `getUsageByIdempotencyKey(ack.key)` quando ack exigido + N ×
  `getUsageByIdempotencyKey` (um refund por output — fan-out O(N) por volta).
- Sucesso: ack exigido e gravado → `setCreativeWorkStatus(…, "generating")` se
  todos os outputs ainda queued → `settled`; sem ack exigido, peça `generating`
  ou qualquer output não-queued → `settled` (sem escrita).
- Falha: qualquer output com `failureCode === "dispatch_failed"` ou qualquer
  refund gravado → `dispatch_failed` com **N refunds** (um por output).
- Reenvio (após 80 voltas sem decidir): re-despacha os outputs ainda queued
  (`result: "recovered"`), grava ack, escreve `generating`, retorna `settled`.
  Agregado nunca visto → throw `generation_settlement_join_timeout`. Reenvio
  ambíguo → throw `generation_settlement_dispatch_uncertain`, sem refund.
- Compensação: `resumeAfterCompensation: Boolean(input.existing)` — replay de
  batch existente retoma `ok` após compensar; batch novo falha.
- Chaves: cobrança `batch.billingKey` (ex.: `creative-work:work-1:initial`);
  refund por output `creative-work:<workId>:output:<outputId>:dispatch-refund`,
  50 créditos cada (`creativeWorkOutput`); ack `<billingKey>:dispatch-ack`.

### Laço 2 — linha 692 — `carouselSlideSettlementAdapter.join` (takeover com cobrança)

- Adaptador: `carouselSlideSettlementAdapter` (linha 616), método `join` (689–789).
- Reads/volta: slide em memória (relido no fim via `listCurrentCarouselSlides`)
  + 1 `getUsageByIdempotencyKey(billingKey)` + 1
  `getUsageByIdempotencyKey(<billingKey>:dispatch-refund)` + 1
  `getUsageByIdempotencyKey(ack.key)` quando exigido.
- Sucesso: slide `completed`/`processing` → `settled` imediato (zero reads);
  ack gravado → `settled` (sem escrita de status).
- Falha: slide `failed` ou refund gravado → `dispatch_failed` com **1 refund**
  do slide.
- Quebra antecipada: sem cobrança, sai do laço (`break`) para o takeover —
  linha órfã de falha pré-provedor não trava o deck.
- Pós-laço (takeover): re-autoriza via `queueAuthorizedCarouselSlide` (gate
  inválido → throw `CarouselGenerationGateError`, sem cobrar); cobra de novo
  via `spend` (`recovery: true`, mesma billing key) — spend negado →
  `dispatch_failed` **sem refunds**; despacha o evento, grava ack, `settled`.
  Despacho ambíguo → throw `generation_settlement_dispatch_uncertain`.
- Compensação: refund único do slide.
- Chaves: cobrança `creative-work:<workId>:carousel-slide:<slideId>:generate`;
  refund `<billingKey>:dispatch-refund`, 50 créditos
  (`creative_work_carousel_slide_dispatch_refund`); ack
  `<billingKey>:dispatch-ack`; evento `<billingKey>:dispatch`.

### Laço 3 — linha 818 — `carouselSlideSettlementAdapter.resolveReplay` (replay sem cobrança)

- Adaptador: mesmo do laço 2, método `resolveReplay` (810–868).
- Reads: cobrança lida 1× antes do laço; por volta: 1 refund + 1 ack (se
  exigido) + releitura do slide.
- Sucesso: `completed`/`processing` → `settled`; ack gravado → `settled`; sem
  ack exigido e status ≠ queued → `settled`.
- Falha: refund gravado ou slide `failed` → `dispatch_failed` + 1 refund.
- Pós-laço: se ainda queued, re-despacha (falha → throw uncertain); grava ack;
  `settled`. **Nenhum `spend` aqui** — diferença de política para o laço 692.
- Chaves: as mesmas do laço 692.

### Laço 4 — linha 1068 — `formatAdaptationSettlementAdapter.resolveReplay (série: replay de derivation única)`

- Adaptador: `formatAdaptationSettlementAdapter` (linha 914), método
  `resolveReplay` (1013–1215).
- Pré-laço: cobrança por `billingIdempotencyKey`; original = `derivationId` do
  metadata, ou `destinationId`, ou `reservation.previous`; refund pré-gravado +
  original → `dispatch_failed` imediato.
- Reads/volta (ack exigido): 1 ack + 1 refund tardio + 1 `getDerivationById`.
  Sem ack: só a releitura da derivation.
- Sucesso: ack gravado → `updateCampaign(…, { status: "generating" })` →
  `settled`; sem ack, status ≠ queued ou `updatedAt > reservationUpdatedAt`
  (toque de progresso) → `updateCampaign` → `settled`.
- Falha: refund tardio → `dispatch_failed` + 1 refund; sem ack e status
  `failed` → `dispatch_failed` (falha terminal rápida COM ack exigido espera o
  ack em vez de virar falha de despacho — linhas 1069–1071).
- Pós-laço: ack final → settled; refund final → failed; `failed` + ack exigido
  → throw `generation_settlement_dispatch_uncertain` (sem ack sintético); se
  queued, re-envia `format-adaptation:<id>` (falha → uncertain); grava ack;
  `touchQueuedDerivation`; `updateCampaign`; `settled`.
- Chaves: cobrança `billingIdempotencyKey` do chamador; refund
  `<billingKey>:dispatch-refund`, 50 créditos (`singleDerivation`,
  `format_adaptation_dispatch_refund`); ack `<billingKey>:dispatch-ack`.

### Laço 5 — linha 1397 — `creativeWorkRevisionSettlementAdapter.join` (revisão do Estúdio)

- Adaptador: `creativeWorkRevisionSettlementAdapter` (linha 1333), método `join`
  (1376–1455).
- Pré-laço: cobrança por `creative-work:<workId>:revision:<outputId>`; **sem
  cobrança → `settled` imediato** (perdedor concorrente ou replay HTTP da mesma
  `revisionKey` não bloqueia no claimer), ou `dispatch_failed` se o
  `failureCode` já estiver marcado. Não há `resolveReplay` para revisões.
- Reads/volta: 1 refund (`<billingKey>:dispatch-refund`) + 1 ack (se exigido)
  + 1 `getCreativeWork` (projeta um output do agregado).
- Sucesso: ack gravado → `settled` (sem escrita); sem ack, status ≠ queued →
  `settled`.
- Falha: `failureCode === "dispatch_failed"` ou refund gravado →
  `dispatch_failed` + 1 refund.
- Pós-laço: se queued, re-despacha a revisão (`result: "recovered"`, falha →
  uncertain sem refund); grava ack; `settled`. Sem `updateCampaign`, sem touch.
- Chaves: cobrança `creative-work:<workId>:revision:<outputId>`; refund
  `<billingKey>:dispatch-refund`, 50 créditos
  (`creative_work_revision_dispatch_refund`); ack `<billingKey>:dispatch-ack`;
  evento `creative-work-revision:<outputId>`.

### Laço 6 — linha 1664 — `resolveDerivationBatchReplay` (helper compartilhado: replay de lote)

- Adaptador: função compartilhada (linhas 1595–1785), chamada pelo
  `resolveReplay` de `derivationBatchSettlementAdapter` (1881–1895), que serve
  a `assistantCreativeTripletSettlementAdapter`, `assistantGoalPackageSettlementAdapter`,
  `deliveryPackageSettlementAdapter` e `campaignBatchDerivationSettlementAdapter`.
- Pré-laço: cobrança; `derivationIds` do metadata; releitura integral do lote
  (N × `getDerivationById` — fan-out O(N)); refund pré-gravado + lote não-vazio
  → `dispatch_failed` imediato com **refund ÚNICO do lote**.
- Reads/volta: (ack exigido) 1 ack + 1 refund tardio + N × releitura; sem ack,
  N × releitura.
- Sucesso: ack → `updateCampaign(generating)` → `settled`; sem ack, algum
  não-queued → `updateCampaign` → `settled`.
- Falha: refund tardio → `dispatch_failed`; sem ack, algum `failed` →
  `dispatch_failed`. Em ambos, **1 refund do valor cheio do lote** — política
  distinta do laço 378 (N refunds unitários).
- Pós-laço: lote vazio → `null`; ack/refund finais; `failed` + ack exigido →
  throw uncertain; re-envia os queued em um único `inngest.send`; grava ack;
  `updateCampaign`; `settled`.
- Chaves: cobrança `billingKey` do produto (ex. triplet
  `assistant-action:<actionId>:creative-triplet`); refund
  `<billingKey>:dispatch-refund` do valor cheio (triplet/goal 150 créditos);
  ack `<billingKey>:dispatch-ack`; eventos `<prefixo>:<derivationId>`.

### Laço 7 — linha 2284 — `assistantPreviewSettlementAdapter.resolveReplay` (série: replay de derivation única)

- Adaptador: `assistantPreviewSettlementAdapter` (linha 2135), método
  `resolveReplay` (2229–2424). Mesma política do laço 4, com três diferenças:
  (1) cobrança fixa `assistant-action:<actionId>:preview`; (2) fallback de
  original = `null` (sem charge metadata → `null`, não `reservation.previous`
  — linha 2250); (3) evento `assistant-preview:<id>` com
  `refundDescription: "assistant_preview_dispatch_refund"`.
- Reads/sucesso/falha/pós-laço: idênticos ao laço 4, incluindo
  `touchQueuedDerivation` + `updateCampaign(generating)` no caminho settled.
- Chaves: refund `<billingKey>:dispatch-refund`, 50 créditos; ack
  `<billingKey>:dispatch-ack`.

### Laço 8 — linha 2658 — `campaignDerivationUnitSettlementAdapter.resolveReplay` (série: replay de derivation única)

- Adaptador: `campaignDerivationUnitSettlementAdapter` (linha 2513), método
  `resolveReplay` (2604–2786). Mesma política dos laços 4 e 7, com três
  diferenças: (1) cobrança/valor/ação/prefixo/metadata parametrizados pelo
  chamador; (2) fallback de original = `reservation.value.derivation`
  (linha 2627); (3) hook `input.onComplete?.()` executado em **todo** caminho
  `settled` (linhas 2667, 2706, 2724, 2781), ausente nos demais.
- Consumidores: `revise-creative`, `revise-creative-annotations`,
  `restyleCampaignSettlementAdapter` (→ unit, linha 2871) e
  `regenerateDerivationSettlementAdapter` (→ unit, linha 3121).
- Chaves: refund `<billingKey>:dispatch-refund` do valor parametrizado; ack
  `<billingKey>:dispatch-ack`.

### Famílias (o que a Task 19 pode unificar vs. o que é política)

| Família | Laços | Mecânica comum (Task 19) | Política intocável (Task 19) |
|---|---|---|---|
| Batch do Estúdio (join) | 378 | espera 80×25ms, fan-out de refunds | N refunds unitários; escreve `generating`; `resumeAfterCompensation` |
| Carousel join (takeover) | 692 | espera 80×25ms | re-cobrança (`spend`, `recovery: true`) no timeout; gate de geração |
| Carousel replay | 818 | espera 80×25ms | sem cobrança; re-despacho + ack |
| Revisão do Estúdio (join) | 1397 | espera 80×25ms | settle imediato sem cobrança; sem `resolveReplay` |
| Replay de lote de derivations | 1664 | espera 80×25ms, fan-out de releitura | refund único do lote; `null` em lote vazio |
| Replay de derivation única | 1068, 2284, 2658 | espera 80×25ms, ack/refund/touch/update | fallback de original por membro; `onComplete` só no 2658; sem ack sintético em `failed` |

### Replay medido (tentativas, queries, outputs, tempo)

Método: suíte temporária (não commitada) exercitando `join`/`resolveReplay` com
os mesmos mocks de `settlement-adapters.test.ts`, cenário ack-exigido-sem-ack
(80 voltas + reenvio), lotes N = 1, 3 e 12. "Reads" = chamadas de repositório
mockadas por replay (cada uma ≥ 1 query em produção); `getCreativeWork` projeta
o agregado inteiro. Contagens de SQL por query exigem log de banco (Task 9/14).

Cenário medido: ack exigido, ack ausente, linhas ainda queued — o laço roda as
80 voltas e o pós-laço re-despacha e assenta (`settled`, 1 `send`). Amostra de
teste (mocks), 1 replay por célula, tempo de parede com timers reais:

| Laço | Lote (N) | Tentativas | Reads (repositório) | Outputs | Tempo total |
|---|---|---|---|---|---|
| 378 (batch join) | 1 | 80 | 320 (80× `getCreativeWork` + 240× `getUsage`) | 1 | 2083 ms |
| 378 (batch join) | 3 | 80 | 480 (80 + 400) | 3 | 2090 ms |
| 378 (batch join) | 12 | 80 | 1200 (80 + 1120) | 12 | 2086 ms |
| 1664 (batch replay) | 1 | 80 | 245 (81× `getDerivationById` + 164× `getUsage`) | 1 | 2085 ms |
| 1664 (batch replay) | 3 | 80 | 407 (243 + 164) | 3 | 2081 ms |
| 1664 (batch replay) | 12 | 80 | 1136 (972 + 164) | 12 | 2094 ms |
| 1068 (unit replay, controle) | 1 | 80 | 245 (81 + 164) | 1 | 2085 ms |

Leitura:

- Os dois fan-outs crescem linearmente com o lote: laço 378 = 80×(3+N) reads,
  laço 1664 = 164 + 81N reads. O controle de derivation única é O(1) por volta.
- Cada `getCreativeWork` do laço 378 projeta o agregado inteiro (peça + N
  outputs + sources): em SQL são várias queries por read — contagem exata de
  queries exige log de banco, não medido aqui.
- 80 × 25 ms = 2000 ms nominais; o medido (~2085 ms) confirma que as pausas
  dominam o tempo com mocks. Em produção, queries, espera por conexão e reenvio
  são adicionais.
- Estes números são de teste, não de produção; servem de baseline para a
  Task 19 comparar após o loteamento (esperado: reads independentes de N).

## Telemetria mínima e baseline medido (Task 9, PR-02)

SHA de execução: `f3b504cb` (HEAD do worktree na execução; as funções abaixo
entram no commit desta tarefa sobre essa base). Fecha o PR-02: reproduções
determinísticas (Tasks 7-8) + baseline por SHA. A ausência de volume real não
bloqueia correções de contrato, mas **proíbe prometer ganho percentual**.

### Eventos novos em `app/src/server/creative-work/job-telemetry.ts`

- `creative_work_preparation_attempt` — `logCreativeWorkPreparationAttempt`:
  `releaseSha`, `environment`, `process` (`web`|`worker`), `workspaceId`,
  `workItemId`, `attemptId` (null até a Task 12 existir), `kind`, `phase`
  (`claim`|`external`|`finalize`|`invalidated`|`expired`), `lockWaitMs`,
  `inTransactionMs`, `externalMs` (null quando não há chamada externa),
  `totalMs`. Mesmo canal e shape de `creative_work_output_stage` /
  `creative_work_output_retry` (`logger.info` + fallback
  `creative_work_telemetry_emit_failed`).
- `creative_work_selection_effect` — `logCreativeWorkSelectionEffect`:
  `releaseSha`, `workspaceId`, `workItemId`, `outputId`, `effect`
  (`library`|`valueEvent`|`recipe`), `status`
  (`done`|`not_requested`|`pending`|`failed`), `attempt`, `code`.
- REGRA DURA: prompts, chaves, conteúdo de cliente e URLs assinadas nunca entram
  nos eventos (coberta pelo teste "nao emite prompt, chave, conteudo de cliente
  nem URL assinada"). Identificadores de alta cardinalidade (`workspaceId`,
  `workItemId`, `attemptId`) vão em log/trace, **nunca** em label irrestrito de
  métrica.

### Baseline por amostra (tráfego de teste)

Toda amostra abaixo é tráfego de teste. Sem amostra, "não medido" — nunca zero.

| Métrica | Valor | Intervalo | n | Percentis | SHA | Flags |
|---|---|---|---|---|---|---|
| Espera por preparação, mesmo Trabalho | 205 ms (amostragem) / 227 ms (total) — ver seção Task 8 | 12/09/2026 | 1 | não medido | `fed92864`/`f3b504cb` | teste; provedor suspenso por promessa; limitada pelo tempo que o teste segurou o modelo |
| Espera por preparação, Trabalho diferente | 5 ms — ver seção Task 8 | 12/09/2026 | 1 | não medido | `fed92864`/`f3b504cb` | teste; passa direto pelo lock escopado por Trabalho |
| Pressão de pool, mesmo Trabalho | 5 de 5 escritores curtos presos — ver seção Task 8 | 12/09/2026 | 5 escritores, 1 rodada | não medido | `fed92864`/`f3b504cb` | teste; `max: 10` por processo |
| Tempo até primeira peça | não medido | — | — | — | — | nenhum emissor de `creative_work_preparation_attempt` em produção ainda |
| Erro por etapa de preparação | não medido | — | — | — | — | idem |
| Efeitos posteriores (`library`/`valueEvent`/`recipe`: `done`/`pending`/`failed`) | não medido | — | — | — | — | PR-01 sem tráfego; nenhum emissor de `creative_work_selection_effect` ainda |
| Replay de settlement: tentativas, reads, outputs, tempo | ver tabela "Replay medido" da seção Settlement (ex.: laço 378, N=12: 80 tentativas, 1200 reads, 12 outputs, 2086 ms) | 12/09/2026 | 1 replay por célula | não medido | `b2ee6511` (conteúdo byte-idêntico no worktree) | teste, mocks; cada read ≥ 1 query; `getCreativeWork` projeta o agregado inteiro |
| Consultas SQL por replay | não medido | — | — | — | — | contagem exata exige log de banco (Task 9/14); **não publicar "400 queries no máximo"** sem medir caminho e lote |
| Custo operacional por versão única selecionada/entregue | não medido | — | — | — | — | sessões do Estúdio e outputs são denominadores diferentes e não devem ser misturados |

### Tráfego real

Não medido. Nenhum dos dois eventos novos tem emissor em produção nesta base;
quando houver, as amostras reais entram em seção separada desta, com
intervalo/`n`/percentis/SHA/flags próprios. Tráfego real e de teste nunca se
misturam na mesma amostra.

### Convenções reafirmadas

- 80 × 25 ms é soma nominal de pausas, não duração máxima. Consultas, espera por
  conexão, escrita e eventual reenvio são adicionais, e as consultas de
  reembolso dependem do número de outputs.
- Prazo de lease proposto para a Task 12:
  `lease = clamp(2 × p99(externalMs) medido aqui, 60s, 300s)`.
  `p99(externalMs)` está **não medido** — a Task 8 suspendeu o provedor por
  promessa de propósito, então tempo de modelo real nunca foi amostrado — e o
  lease, portanto, **não calculado**. Não copiar os 90 s do editor de camadas.
