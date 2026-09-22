# Inventário dos findings de performance do Devin

Data: 22/09/2026. Ticket: [Reconciliar os findings do Devin](https://github.com/jhowtkd/adscale/issues/481).
Revisões: base do plano `fddb9035` → ponta verificada `c8653c51` (merge do PR 480).

Revisão do documento: **v4** (22/09/2026). A leitura autenticada das abas do scan identificou
60 registros Unassigned e 10 Resolved, cada um com ID e título (§8). O mapeamento temático da
v3 (§3A) não era uma enumeração de registros. O contador adicional `10 of 75` permanece
incompatível com os 70 registros expostos pelas abas e com o relato final da sessão original.

Fonte primária das abas: https://app.devin.ai/sessions/968709ebcbf24c869dd400a28decf217?tab=scan_findings&stage=unassigned
(lida em 22/09/2026 por sessão autenticada, com abertura individual para copiar cada ID).
Relato final da [sessão original do scan](https://app.devin.ai/sessions/53e13738697a4573943c056a0a01ec8f):
70 findings abertos na criação, sendo 8 high, 23 medium e 39 low, na revisão `fddb903`.

## 1. Contadores

| Contador | Valor observado | Fonte | Status neste inventário |
| --- | --- | --- | --- |
| Unassigned | 60 | aba do scan | 60 IDs e títulos conferidos no §8; 21 medium e 39 low |
| Resolved (aba) | 10 | aba do scan | 10 IDs e títulos conferidos no §8; 3 Merged e 7 Dismissed |
| Merged | 6 | aba do scan | **confirmado**: PRs 475, 476, 477, 478, 479, 480, todos merged em 21–22/09/2026 (gh API + `git log origin/main`) |
| Header open/resolved | 65 open · 3 resolved | cabeçalho do scan | não bate com as abas; o scan mostra estado `Failed`. Não usado para inferir IDs ausentes |
| Reviewed | 10 of 75 | detalhes do scan | o denominador 75 não é reproduzido pela listagem de 70 nem pelo relato final de 70; origem dos 5 adicionais indeterminada |
| High + Unassigned | 0 itens | filtro do scan | estado atual; o relato original de 8 high é preservado, sem inferir movimentação individual |
| Registros 1:1 lidos | 70 | abas e detalhes individuais | 60 Unassigned + 10 Resolved; IDs/títulos/classificação no §8 |

Reconciliação: os 70 registros enumerados nas abas coincidem com o total do relato final
original, mas `10 of 75` e `65 open · 3 resolved` não têm derivação verificável na UI atual.
Não se inventam cinco IDs adicionais nem se equiparam os seis PRs merged a seis registros.
Os IDs citados em corpos de PR podem vir de outros lotes; o vínculo de §8 usa a causa e o
código na revisão indicada, não apenas prefixos de ID.

## 2. Correções já integradas (os seis PRs)

| PR | Merge | sfinds citados | Causa corrigida | Testes pertinentes @ `c8653c51` |
| --- | --- | --- | --- | --- |
| 475 | 21/09 | `sfind-61ecd138…`, `sfind-c69941d7…` | missions/progression: ~14 queries seriais → 2 rodadas paralelas (`Promise.all`); `getFirstCampaignId` duplicada removida | `src/server/progression` — verdes |
| 476 | 21/09 | — (não citado) | carrossel: vereditos de comparação persistidos em `artRefinementState.comparisons`, reutilizados entre refreshes; linhagens em paralelo | `refine-carousel-slide.test.ts` (22) — verdes |
| 477 | 21/09 | `sfind-e75c75…` (high) | biblioteca (`GET /api/creative-work` works view): `listCanonicalWorks` ilimitado → `listCanonicalWorksPage` keyset em `updatedAt`, hook em `useInfiniteQuery` | route (47) + queries + hook — verdes |
| 478 | 21/09 | — (não citado) | output-learning: rajadas de `recomputeClientOutputLearnings` coalescidas (N passes → ≤2); índice recomendado já existia, sem migration | `output-learning/service.test.ts` — verdes |
| 479 | 21/09 | `sfind-094c64f6…` (+ agrupado `sfind-df9f4f0d…`) | served-ads: upserts por anúncio/janela → `upsertServedAds` + `upsertAdMetricsBatch` por (conta, janela) | `sync.test.ts` (14) + `resync.test.ts` (8) — verdes |
| 480 | 22/09 | `sfind-94abc336…`, `sfind-5abb79d1…` (truncados no corpo) | thread detail: lookups por linhagem → helpers em lote (`listArtifactVersionsForLineages` com `row_number()`); `buildGoalProjection` com `preload` | `artifact-version/service.test.ts` + `goal/projection.test.ts` — verdes |

Evidência de execução (worktree descartável em `/tmp`, `origin/main` = `c8653c51`,
Node v26.7.0, `node_modules` do checkout reusado — `app/package.json` idêntico entre as revisões):

```sh
npx vitest run --config config/vitest.config.ts src/server/progression \
  src/server/application/refine-carousel-slide.test.ts \
  src/app/api/creative-work/route.test.ts \
  src/server/creative-work/canonical/queries.test.ts \
  src/lib/hooks/use-canonical-works.test.ts \
  src/server/output-learning/service.test.ts \
  src/server/served-ads/sync.test.ts src/server/served-ads/resync.test.ts \
  src/server/assistant/artifact-version/service.test.ts \
  src/server/assistant/goal/projection.test.ts
# Test Files 13 passed (13) · Tests 133 passed (133) · sem tempos frágeis no CI
```

Antes/depois por PR (alegado no corpo, comportamento pós-fix confirmado por leitura @ `c8653c51`;
medição de produção não executada — evidência local não equivale a ganho em produção):

- 475: ~14 round-trips seriais → 2 rodadas paralelas por request em `/api/workspace/missions` (não necessariamente 2 queries ao banco).
- 476: chamadas de visão por deck O(refreshes × N × B) → O(N × B); refresh sem mudança não repete julgamento.
- 477: per request N+M linhas + projeção total → ≤25+25 linhas + outputs de ≤25 works.
- 478: rajada de N decisões → ≤2 passes completos por cliente.
- 479: por conta 4N statements → 4 por execução.
- 480: rota `8 + 9L + 2Lc` queries → ~12, independente de L.

## 3. Classificação por causa → ticket

Legenda: **confirmado** = padrão verificado no código na revisão indicada; **já corrigido** =
ausente na ponta por um dos seis PRs; **duplicado** = mesmo registro/causa de outro item;
**evidência insuficiente** = hipótese do scan, sem leitura local individual.

Arquivos alterados entre `fddb9035..c8653c51` (fora `.planning/`): 29 arquivos, todos dentro
dos seis PRs acima. Causas fora desses arquivos mantêm o status da leitura em `fddb9035`.

| # | Causa (grupo) | Classificação | Revisão/evidência | Ticket |
| --- | --- | --- | --- | --- |
| 1 | `capturedAt` na identidade do cache (sample-coverage) | confirmado | `c8653c51` `app/src/app/api/feedback/sample-coverage/route.ts:33-38` — arg fresco a cada chamada, hit impossível | 482 |
| 2 | `capturedAt` na identidade do cache (quality-improvement) | confirmado (ocorrência distinta, mesmo lote) | `fddb9035`, área não tocada pelos seis PRs | 482 |
| 3 | `rowContext` revarre todas as fontes por anúncio | confirmado | `c8653c51` `app/src/server/served-ads/report.ts:137-157` — loop O(fontes) por linha | 483 |
| 4 | creative-work detail: leituras seriais | evidência insuficiente (hipótese a revalidar na implementação) | `fddb9035`, área não tocada | 484 |
| 5a | goal projection: última versão por linhagem | **já corrigido** pelo PR 480 | `c8653c51` `app/src/server/assistant/goal/projection.ts:129` — `listArtifactVersionsForLineages(ids, 1)` | 485 (parcial) |
| 5b | A/B: enriquecimento serial (`versionA`/`versionB`) | confirmado | `c8653c51` `app/src/server/assistant/artifact-version/comparison.ts:166-167` — awaits seriais | 485 (restante) |
| 6 | training assets N+1 | evidência insuficiente | `fddb9035`, área não tocada | 486 |
| 7 | missions/progression: queries seriais + primeira-campanha duplicada | **já corrigido** pelo PR 475 | `c8653c51` `app/src/server/progression/{evidence,missions/evidence}.ts` — 2 rodadas paralelas, duplicada removida | 487 (implementado; falta só evidência antes/depois p/ fechar) |
| 8a | carrossel: re-julgamento a cada refresh | **já corrigido** pelo PR 476 | `c8653c51` `refine-carousel-slide.ts:118-162` — `comparisons` persistidas e reutilizadas | 488 (parcial) |
| 8b | peça única: `refreshArtRefinementState` recarrega imagens em série e re-julga tudo | confirmado | `c8653c51` `app/src/server/application/refine-creative-work.ts:131-171` — sem reutilização de `comparisons` | 488 (restante) |
| 9 | layerize: recomposição por camada | confirmado | `fddb9035`, área não tocada pelos seis PRs | 489 |
| 10 | materialização PNG/PSD duplicada | confirmado | `fddb9035`, área não tocada | 490 |
| 11 | QA + person-fidelity / referências / preflight seriais | evidência insuficiente | `fddb9035`, área não tocada | 491 |
| 12 | uploads do composer seriais (até 3 imagens) | evidência insuficiente | `fddb9035`, área não tocada | 492 |
| 13 | settlement: polling fixo 25 ms + releituras nos 8 adapters | confirmado | `c8653c51` `app/src/server/generation/settlement-wait.ts:7` — pausa de 25 ms preservada | 493 |
| 14a | resync/sync: upserts por anúncio/janela | parcialmente corrigido pelo PR 479 (lote único por janela, **sem chunks**) | `c8653c51` `sync.ts:231-237`, `repository.ts:329-391` — 1 statement multi-linha por (conta, janela), sem divisão em chunks | 494 (restam chunks) |
| 14b | `upsertAdAccounts` em loop por conta | confirmado | `c8653c51` `repository.ts:294-316` — um statement por conta | 494 (restante) |
| 14c | `listAds` por conta reusado entre janelas | dividido por caminho: `syncConnection` e `resync` OK (pré-existente); **`runReconcile` NÃO resolvido** | `c8653c51` OK em `sync.ts:159-165` e `resync.ts:77-82`; PENDENTE em `reconcile.ts:255-258` — `listAds` dentro do loop de janelas | 494 (resta `runReconcile`) |
| 15 | cópia de mídia serial por anúncio | confirmado | `c8653c51` `sync.ts:232-235` — `await copyCreativeMedia` em loop | 495 |
| 16 | purge global por conexão + deletes seriais; TTL candidato | confirmado (purge); evidência insuficiente (índice) | `c8653c51` `sync.ts:241` — `purgeExpiredServedAds` por `syncConnection` | 496 |
| 17a/b | billing history: 2 relatos (transactions; transactions+grants) | confirmado; **duplicados entre si** (mesma paginação) | `fddb9035`, área não tocada | 497 (consolida os 2) |
| 18a/b | funnel owner: 2 relatos sobre `listUsageEventsForOwner` | **duplicados entre si** (mesma consulta) | `fddb9035`, área não tocada | 498 (consolida os 2) |
| 19 | diagnostics: agregação antes da paginação | confirmado | `fddb9035`, área não tocada | 499 |
| 20 | corpus backfill/seleção em lote/progresso | evidência insuficiente | `fddb9035`, área não tocada | 500 |
| 21a | rajadas de recompute de learnings | **já corrigido** pelo PR 478 | `c8653c51` `app/src/server/output-learning/service.ts:24-49` — coalescedor por cliente | 501 (parcial) |
| 21b | `syncOutputLearningsForClient` grava por draft; `persistProposedAdjustments` consulta+insere por proposta | confirmado | `c8653c51` `repositories/client-output-learning.ts:75+` (loop por draft), `calibration/service.ts:31-69` (N finds + N inserts) | 501 (restante) |
| 22 | evidências/hashes/export records com consultas repetidas | evidência insuficiente | `fddb9035`, área não tocada | 502 |
| 23 | campaign assets/derivations ilimitados | evidência insuficiente | `fddb9035`, área não tocada (PR 477 paginou a biblioteca de works, não estes) | 503 |
| 24 | export completo sem streaming | evidência insuficiente | `fddb9035`, área não tocada | 504 |
| 25 | selection effects / thumbnails / brand-knowledge snapshots | evidência insuficiente | `fddb9035`, área não tocada | 505 |
| 26 | graduation counts / funnel N passagens / CSV / memos / scroll / bulk / notificações | evidência insuficiente | `fddb9035`, área não tocada | 506 |
| 27 | biblioteca de works ilimitada (`sfind-e75c75…`, high) | **já corrigido** pelo PR 477 — **sem ticket** (nenhum trabalho a abrir) | `c8653c51` `creative-work/canonical/queries.ts:82-202` — `listCanonicalWorksPage` + cursor | — |

## 3A. Mapeamento temático parcial (v3)

Temas nomeados no plano ou citados em corpos de PR, com a causa correspondente em §3.
IDs `F-xx` são referências locais preservadas para rastreabilidade; não representam registros
individuais do scanner. Um tema pode reunir vários registros ou sobrepor outro tema.
Este mapeamento não permite calcular quantidade coberta, resolvida ou faltante.

**B1 — cache/CPU:** F-01 sample-coverage cache (→1); F-02 quality-improvement cache (→2);
F-03 report context por anúncio (→3).

**B2 — leituras frequentes:** F-04 creative-work detail (→4); F-05 goal
projection/lineages (→5a); F-06 training-assets N+1 (→6); F-07a/F-07b missions/progression =
`sfind-61ecd138…` + `sfind-c69941d7…`, resolvidos pelo PR 475 (→7); F-08 selection-effect
aggregate (→25); F-09 thumbnail última derivation (→25); F-10 brand-knowledge snapshots (→25).

**B3 — imagens/visão:** F-11 layerize composite (→9); F-12 materialização PNG/PSD (→10);
F-13 art-refinement compare — carrossel resolvido pelo PR 476, peça única pendente (→8a/8b);
F-14 QA + person-fidelity (→11); F-15 referências da geração (→11); F-16 exact-asset preflight
(→11); F-17 uploads do composer (→12).

**B4 — settlement:** F-18 espera de 25 ms e F-19…F-26 oito adapters afetados (→13).
Os adapters são locais de ocorrência do padrão, não oito findings adicionais confirmados.

**B5 — Meta/served ads:** F-27 executeResync por ad + F-29 runReconcile por janela —
aspecto upsert = `sfind-094c64f6…` + agrupado `sfind-df9f4f0d…`, loteados pelo PR 479, **sem
chunks** (→14a); F-28 `upsertAdAccounts` em loop (→14b); F-29bis `listAds` no loop de janelas
do `runReconcile` — verificado pendente em `reconcile.ts:255-258` (→14c); F-30 cópia de mídia
serial (→15); F-31 purge/disconnect serial (→16); F-32 purge C+1 (→16); F-33 índice TTL (→16).

**B6 — histórico/relatórios:** F-34 billing transactions + F-35 billing transactions+grants
— par duplicado (→17a/b); F-36/F-37 funnel `listUsageEventsForOwner` — par duplicado (→18a/b);
F-38 diagnostic works (→19); F-39 corpus progress (→20); F-40 campaign assets/derivations
(→23); F-41 user export (→24).

**B7 — corpus/feedback:** F-42 `syncOutputLearningsForClient` — agendamento coalescido pelo
PR 478, writes em lote pendentes (→21a/21b); F-43 corpus backfill (→20); F-44
`persistProposedAdjustments` (→21b); F-45 `batchSelectDerivationsForCorpus` (→20); F-46
approval-package evidence (→22); F-47 `resolveAssetLinks` (→22); F-48 `resolveEvidenceHashes`
(→22); F-49 `exportAllApproved` (→22).

**B8 — melhorias pequenas:** F-50 graduation counts + F-51 funnel N passagens + F-52 CSV +
F-53 ownership validations (→26/498); F-54 `compareArtifactVersions` A/B — enriquecimento
serial pendente (→5b); F-55 `useMemo` campaign + F-56 scroll listener + F-57 bulk archive/delete
+ F-58 notificações mark-as-read (→26).

**Temas resolvidos por PR fora dos lotes:** F-59 biblioteca de works =
`sfind-e75c75…` (high), resolvido pelo PR 477, sem ticket (→27); F-60/F-61 thread detail =
`sfind-94abc336…` + `sfind-5abb79d1…`, resolvidos pelo PR 480 (→5a; sobreposição parcial com
F-05 — mesma projeção, outro caminho).

**Rastreabilidade v4:** §3A continua sendo um índice de temas; o mapeamento dos 70 IDs reais,
incluindo duplicatas e lacunas sem ticket, está em §8. As estimativas numéricas da v2 seguem
retiradas. O denominador `75` do painel continua sem explicação verificável.

## 4. Duplicatas consolidadas

- Billing history: 2 registros → 1 causa → ticket 497.
- Funnel `listUsageEventsForOwner`: 2 registros → 1 causa → ticket 498.
- PR 479 cita `sfind-094c64f6…` em outro lote; a aba deste scan contém
  `sfind-df9f4f0d…` para a mesma causa corrigida. Não são dois registros desta lista.
- `capturedAt`: 2 ocorrências distintas (não duplicatas), 1 lote → ticket 482.

## 5. Lacunas e decisões (sem ampliar escopo)

1. **Ticket 487 está implementado pelo PR 475** (critérios 1–3 atendidos; testes existentes passam).
   Falta apenas a evidência antes/depois para fechá-lo. Não reimplementar.
2. **Parciais**: 485 (resta A/B serial), 488 (resta peça única), 494 (restam **chunks nos
   upserts**, **`listAds` fora do loop de janelas no `runReconcile`** em `reconcile.ts:255-258`,
   `upsertAdAccounts` em lote + verificação de retries/idempotência), 501 (restam writes em lote).
   Implementar somente o restante descrito na coluna "restante" acima.
3. **Finding sem ticket, já corrigido**: biblioteca de works (PR 477). Nenhuma ação.
4. **Tickets dependentes deste inventário (484–487, 491, 492, 494–498, 500–506) permanecem
   bloqueados enquanto a issue 481 estiver aberta.** Após aceitar o inventário, revalidar no código
   cada linha marcada `E` antes de implementar; a classificação do scan não prova o comportamento
   na ponta atual. Os tickets originalmente sem dependência não mudam.
5. **Lacunas sem ticket:** os registros marcados `sem ticket` em §8 não ampliam automaticamente
   #482–#506. O produto pode decidir descartá-los, consolidá-los ou especificá-los depois.
   O painel `Failed` explica por que o cabeçalho não é tomado como fonte de contagem, mas não
   comprova a origem do denominador 75; export interno do Devin é necessário para essa explicação.

## 6. Limites

- Nenhum deploy, migration remota, chamada paga, exclusão de dados ou alteração de status no Devin.
- Mudanças de API/schema/armazenamento nos tickets seguem exigindo proposta e aprovação próprias.
- Evidência local (leitura + 133 testes verdes) não equivale a ganho em produção.

## 7. Changelog

- v4 (22/09/2026): conferidos 70 IDs/títulos na UI autenticada; status Merged/Dismissed,
  causas, tickets e lacunas relacionados no §8; contadores incompatíveis preservados como tal.
- v3 (22/09/2026): retiradas contagens especulativas de cobertura/lacuna; adapters não contam
  como findings individuais; dependentes permanecem bloqueados pela issue 481 aberta.

- v2 (22/09/2026): pós-revisão — escopo #494 corrigido (`runReconcile` + chunks), missões como
  2 rodadas paralelas e enumeração local; as estimativas de cobertura dessa versão foram
  retiradas na v3. Fechamento 1:1 pendente de exportação dos registros.
- v1 (22/09/2026): inventário inicial em 27 linhas de causa; superseded.

## 8. Findings conferidos individualmente

Cada ID abaixo veio da URL do detalhe aberto na UI autenticada em 22/09/2026. Títulos e
severidades são os exibidos pelo scanner, que analisou `fddb9035`. `C` = padrão confirmado
por leitura na ponta `c8653c51` ou em `fddb9035` quando a área não mudou (§3); `E` = apenas
relato do scan ou leitura ainda insuficiente na ponta; `J` = já corrigido no PR integrado
indicado (§2); `D` = duplicata da causa primária indicada. `E` não autoriza implementação
sem revalidar código, contrato e teste. O scan não mediu ganho de produção.

### 8.1 Unassigned — 39 low

| ID | Título original | Classe | Destino/evidência |
| --- | --- | --- | --- |
| `sfind-8305642a4c9a48af9e2d68954504b019` | Selection-effect processor over-fetches the full creative-work aggregate per effect | E | #505 · §3/25 |
| `sfind-2160bcb17a5a49f092ff3a29e73820f9` | Funnel summary makes ~20 full passes over the event array | E | #498 · §3/26 |
| `sfind-e1ac37babe314943be6957837ca9bed1` | Serial per-reference DB lookups in resolveAssetLinks (batchable with inArray) | E | #502 · §3/22 |
| `sfind-dcf88cf96e9c427f97e9ead044fd51e2` | unstable_cache never hits: fresh capturedAt timestamp passed as cached-function argument | C | #482, quality-improvement · §3/2; PR #507 aberto |
| `sfind-da59325ff67942baa99ffc670f10954a` | Serial per-reference asset lookup + download + normalize inside generate-and-store-output step | E | #491 · §3/11 |
| `sfind-95fdeed9355d44dc98ad72032a0771f1` | Campaign derivations GET loads all derivations without a limit/pagination | E | #503 · §3/23 |
| `sfind-74121e60a80742cfa67748f7d145d54e` | Approval-package POST re-validates campaign ownership once per selected root | E | #502 · §3/22 |
| `sfind-5428463f6c484a7f983128aee94f36c9` | Campaign assets GET loads all assets without a limit/pagination | E | #503 · §3/23 |
| `sfind-b96eee1f19aa4a809efb0a53261f80ff` | runReconcile refetches ad list per window instead of once per account | C | #494 · §3/14c |
| `sfind-5c063023dcac429aace639d752646214` | upsertAdAccounts issues one INSERT..ON CONFLICT per account in a serial loop | C | #494 · §3/14b |
| `sfind-5596cbc12ed749839f3eb75b66ff39bc` | Owner funnel analytics loads the entire usage_events table into memory (no limit) | D | #498 · mesma consulta de `sfind-6ddb4de25eba43469ef46fce91f89aaf` |
| `sfind-06ab72e783f6417695a31ea9e4fcd8d7` | batchSelectDerivationsForCorpus re-fetches the same campaign once per derivation | E | #500 · §3/20 |
| `sfind-5b4f2f2233f64a46b6e739f20f4996c1` | Exact-asset preflight loads and decodes assets from object storage sequentially | E | #491 · §3/11 |
| `sfind-44d2f24bc5d54cbe808ff83caa473174` | persistProposedAdjustments issues one lookup + one insert per proposal | C | #501 · §3/21b |
| `sfind-201a342a4a89480b9d98b2d97bbe93c9` | Settlement join polls the DB every 25 ms with 3–4 sequential reads per tick | C | #493 · §3/13 |
| `sfind-3d84d9e9e673460faee9430773b92e43` | getCorpusOperationsProgress loads the full corpus and counts in application memory | E | #500 · §3/20 |
| `sfind-a56a5c6c65634db8901609bb5ad1e975` | User data export loads entire workspace-scoped tables into a single in-memory JSON response | E | #504 · §3/24 |
| `sfind-e7398593b97445008a5a9c57735fc6c9` | exportAllApproved writes one INSERT per approved derivation instead of a single bulk insert | E | #502 · §3/22 |
| `sfind-fc1540b51d1945499d617c329943e79c` | listBrandKnowledgeVersions returns full snapshot JSON for every version | E | #505 · §3/25 |
| `sfind-60b8ff3ff3844ef2922cb62c586403c8` | getLatestDerivationOutputKeysByCampaignIds fetches all completed derivations to keep one per campaign | E | #505 · §3/25 |
| `sfind-3d1559bc5a2b4b0b9d9366b67b6bcbed` | Per-evidence workspaceMembers query inside resolveEvidenceHashes loop | E | #502 · §3/22 |
| `sfind-3cdd638969814a66ba55395b057e99a7` | Bulk archive/delete fans out one request + one cache invalidation per selected campaign | E | #506 · §3/26 |
| `sfind-bd7e22bf911f41d2bc6e334367590650` | Sequential (not parallel) image uploads when attaching multiple sources | E | #492 · §3/12 |
| `sfind-29d0cf1b1bd04e1c8e0e31837fd1c1fa` | CSV export awaits three independent queries sequentially instead of in parallel | E | #498 · §3/26 |
| `sfind-8fa705108abc4ee69821f9bc1bfdeeae` | useMemo for derivation mapping is defeated by an unstable campaign object each render | E | #506 · §3/26 |
| `sfind-12280624182e4f06a6e118e916a90613` | Scroll listener is removed and re-added on every scroll event | E | #506 · §3/26 |
| `sfind-78f86eca479f40c4a8dcef3efe914f03` | Notification group click fires one PATCH + cache invalidation per unread notification (missing batch mark-as-read) | E | #506 · §3/26 |
| `sfind-e58080f843914f42957f154115c11309` | Independent ownership validations awaited sequentially on analytics ingest | E | #498 · §3/26 |
| `sfind-b3dbc157bafb460b8017c802f4cf7f4a` | Creative version A and B enriched sequentially in compareArtifactVersions | C | #485 · §3/5b |
| `sfind-4ce2e0e49dd34533815e00cc82a95cc5` | Redundant membership query and per-attachment asset lookups on chat POST | E | sem ticket: chat do Assistente, fora do escopo de #492/#506 |
| `sfind-3a4cf306f2bf4aaeaa0a201dfbaa0af7` | Action and message rows re-fetched three times across confirm pipeline | E | sem ticket: confirmação do Assistente |
| `sfind-4cb945662fff4aba99775454c78480c5` | aggregateStudioFunnel re-scans the full event array per session (O(sessions × events)) | E | #498 · §3/26 |
| `sfind-f0e6311d82474c3f8f0063cbbba41e79` | Piece-review share page loads every output and every source (with AI-analysis jsonb) of the creative work to render one output | E | sem ticket: página pública de revisão |
| `sfind-d8afc6992cea4a978dc307bae2a17386` | GET /api/workspace/progression runs 8 sequential evidence queries and writes a snapshot on every read | E | sem ticket: escrita no GET de progressão é distinta das missões de #487; revisar após PR #475 |
| `sfind-f1e151e90edc4a32b4130a76ce63c7b3` | Serial per-proposal UPDATEs when staling creative proposals on plan change | E | sem ticket: propostas do Assistente, distintas de #501 |
| `sfind-ca2a571ed2cf423cb35ab714bc73772b` | workspaceHasUnlimitedBillingAccess repeats two queries already executed inside getWorkspaceBillingAccess | E | sem ticket: acesso de billing, distinto de histórico #497 |
| `sfind-931db72bca2b4a5ea6ab0d3bda85ae10` | normalizeReferenceBuffers processes reference images serially through sharp | E | #491 · §3/11 |
| `sfind-a3e1f064fc17420595d5faab34f9e56a` | Calibration GET over-fetches unused creative_work_sources per slot | E | sem ticket: rota de calibração |
| `sfind-3c06d090ae2549d295d11af6583b0c7b` | Chat attachment uploads run serially instead of in parallel | E | sem ticket: chat do Assistente, distinto de #492 |

### 8.2 Unassigned — 21 medium

| ID | Título original | Classe | Destino/evidência |
| --- | --- | --- | --- |
| `sfind-143f0416261d4c27b010e34ff55bb7cf` | Art-refinement summary reloads images and re-runs comparisons on every refresh | C | #488, Peça única; carrossel já corrigido pelo PR #476 · §3/8 |
| `sfind-9af041287c6a4f6da543d09d9bc9b2ff` | syncOutputLearningsForClient issues one sequential upsert per draft instead of a batched write | C | #501 · §3/21b |
| `sfind-56b953bed6ef4aeea31d920dbb6adf5b` | unstable_cache never hits: fresh capturedAt timestamp passed as cached-function argument | C | #482, sample-coverage · §3/1; PR #507 aberto |
| `sfind-217a7cfc46044882812423b73e96e364` | Quadratic per-row context scan in buildServedAdsReport (rowContext re-scans all sources for every row) | C | #483 · §3/3 |
| `sfind-983fead0bfee4df5a69e38ef77b64114` | recomposeStoredLayers re-encodes the full canvas PNG once per layer instead of a single multi-input composite | C | #489 · §3/9 |
| `sfind-51073b626b90418fbe8aab53095f99c1` | PSD materialization re-downloads and re-decodes every layer and re-renders the composite already produced for the PNG | C | #490 · §3/10 |
| `sfind-df9f4f0d16394b60976f88fa4ceaf3cc` | executeResync writes served-ads and metrics one row per grouped ad in serial awaits | J | PR #479 corrige a gravação por linha; #494 ainda precisa de chunks e outros caminhos · §3/14a |
| `sfind-e2a2a85e27dd4c2592f495ffe64b6e31` | Corpus backfill processes up to 1000 derivations strictly serially, ~7–12 queries each | E | #500 · §3/20 |
| `sfind-3e6aede58f824260aad8a9474960d6d8` | Serial per-row storage+DB deletes in purge and disconnect | C | #496 · §3/16 |
| `sfind-25562eab169746a59be2f0bb09e7709d` | Serial per-creative and per-media-kind media copy in sync | C | #495 · §3/15 |
| `sfind-047eea4493df4143bbeaccb9019791a7` | TTL purge full-scans served_ads (no index on last_delivered_at) and re-runs per connection | C | #496; repetição confirmada, índice ainda sem plano medido · §3/16 |
| `sfind-a07709d06474423c89dd3a81c7156ab4` | Billing history returns every credit transaction for the workspace without pagination | C | #497 · §3/17 |
| `sfind-ab97365efbe74cfdbf504a6f068dd081` | Independent objective-QA and person-fidelity vision calls run sequentially on the generation path | E | #491 · §3/11 |
| `sfind-8698c96fbc5d452b89a54ea70b83ab3b` | Works-list endpoint aggregates the entire diagnostic_events table per request; cursor pagination does not reduce the scan | C | #499 · §3/19 |
| `sfind-6ddb4de25eba43469ef46fce91f89aaf` | Owner funnel loads the entire usage_events ledger (no limit) while sibling event sources are capped at 5000 | E | #498; causa primária do par · §3/18 |
| `sfind-003ed4aa077d4cf9823653b7e4bcce23` | Graduation report issues 4 sequential count queries (2 full scans) that collapse into one | E | #498 · §3/26 |
| `sfind-7460d7d6b94d453f87063006aaea7d64` | GET /api/workspace/missions issues ~15 sequential single-row queries (including a duplicated one) that could run concurrently | J | PR #475, #487; falta evidência antes/depois · §3/7 |
| `sfind-8fe5ec6960c9402db602a29f97335947` | buildGoalProjection re-fetches each lineage and fans out one version query per creative lineage on a polled endpoint | J | PR #480, #485 parcialmente; A/B ainda serial · §3/5a |
| `sfind-e1d75198c1064d689816bb8b3f1bff9a` | Credit history endpoint returns the full unbounded transaction and grant history | D | #497 · mesma paginação de `sfind-a07709d06474423c89dd3a81c7156ab4` |
| `sfind-33e609384ba74dc3b6e3c186bd592ae5` | N+1: training-assets GET issues one asset query per training reference | E | #486 · §3/6 |
| `sfind-db85fb114c5944f8bb1b4fedfff3b548` | Creative-work detail GET (2s poll) serializes ~10 independent DB round trips per request | E | #484 · §3/4 |

### 8.3 Resolved — 3 Merged, 7 Dismissed

`Merged` e `Dismissed` abaixo são estados observados no filtro da UI, não vereditos
automáticos sobre a ponta atual. Há três IDs em Merged, enquanto seis PRs estão merged;
um PR pode resolver vários IDs e outros PRs podem não ter ID associado nesta aba.

| Estado | ID | Título original | Classe | Destino/evidência |
| --- | --- | --- | --- | --- |
| Merged | `sfind-e75c753412b748f1add5228e3866ff33` | Unbounded creative-work library listing loads all campaigns, works, and outputs per request | J | PR #477 · §3/27 |
| Dismissed | `sfind-8fd01cf7441a4bb6bcfd882e8f70dc58` | Unbounded canonical-works listing on GET /api/creative-work drives the always-mounted sidebar (per page + 5s poll) | D | mesma causa de `sfind-e75c753412b748f1add5228e3866ff33`, PR #477 |
| Dismissed | `sfind-b1a16d39c0424e58ae004b1a7aed5afd` | Workspace list endpoint loads every creative work and every output row (full jsonb columns) with no limit | D | mesmo fan-out de `sfind-e75c753412b748f1add5228e3866ff33`, PR #477 |
| Dismissed | `sfind-b411200c300348f286dd5b701d052c6e` | Unbounded workspace load on GET /api/creative-work default listing | D | mesma causa de `sfind-e75c753412b748f1add5228e3866ff33`, PR #477 |
| Merged | `sfind-5abb79d16a534c1f9665ef21092ab302` | getThreadArtifactVersionState issues ~6 queries per lineage (N+1 fan-out) on polled thread detail path | J | PR #480 · §3/5a |
| Merged | `sfind-94abc336fc1c42ec86aea55978d91398` | Polled thread detail endpoint issues ~10 queries per artifact lineage (N+1 across two sub-builders) | J | PR #480 · §3/5a |
| Dismissed | `sfind-91caaf29fafc4a9d94dc369cd23a2aeb` | syncConnection writes served-ads/metrics one row per ad in serial awaits (6h job) | J | mesmo padrão de `sfind-df9f4f0d16394b60976f88fa4ceaf3cc`, corrigido por PR #479; #494 parcial |
| Dismissed | `sfind-fe969b53570447b2a10cc16261ffb3a0` | Objective QA and person-fidelity vision calls run sequentially though independent | D | mesma causa de `sfind-ab97365efbe74cfdbf504a6f068dd081`, #491 ainda aberto |
| Dismissed | `sfind-e853a5d2cc6b4f50b6747293f8768873` | purgeExpiredServedAds deletes expired rows one at a time | D | mesmo purge de `sfind-3e6aede58f824260aad8a9474960d6d8`, #496 ainda aberto |
| Dismissed | `sfind-bd01a36b787141cb93114d568f832b59` | Serial per-row S3+DB round trips (and per-row existence SELECT) in curated-inspiration import | E | sem ticket: importação eventual, impacto/execução atual não verificados |
