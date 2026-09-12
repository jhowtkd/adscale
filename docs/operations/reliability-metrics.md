# Métricas de confiabilidade (baseline por SHA)

> Nota de escopo (Task 18, PR-06): este arquivo foi criado pela Task 18 contendo
> **somente** a seção "Settlement: oito laços" abaixo. A Task 9 (PR-02) ainda não
> rodou; ela acrescentará as demais seções (espera de preparação, tempo até
> primeira peça, erro por etapa, efeitos posteriores, custo operacional, amostras
> com intervalo/`n`/percentis/SHA/flags, tráfego real vs. teste). O merge futuro é
> trivial: acrescentar seções, sem reescrever esta.
>
> Sem amostra, escrever "não medido" — nunca zero. Tráfego real e de teste em
> seções separadas. 80 × 25 ms é soma nominal de pausas, não duração máxima.

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
