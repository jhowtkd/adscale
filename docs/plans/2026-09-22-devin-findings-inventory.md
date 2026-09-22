# Inventário dos findings de performance do Devin

Data: 22/09/2026. Ticket: [Reconciliar os findings do Devin](https://github.com/jhowtkd/adscale/issues/481).
Revisões: base do plano `fddb9035` → ponta verificada `c8653c51` (merge do PR 480).

Revisão do documento: **v3** (22/09/2026). Corrige o escopo Meta de #494 (finding `listAds` é do
`runReconcile`, não do `syncConnection`; upserts sem chunks), a redação de missões (duas rodadas
paralelas, não duas queries) e amplia a rastreabilidade com findings enumerados (§3A). v1 e v2 substituídas pela v3. Status: inventário parcial, aguardando reconciliação individual.

Fonte primária do scan: https://app.devin.ai/sessions/968709ebcbf24c869dd400a28decf217?tab=scan_findings&stage=unassigned
(consultada em 22/09/2026 pelo Chrome autenticado no plano de findings; fetch programático
neste inventário retornou apenas o shell vazio do app — sem acesso aos registros individuais).

## 1. Contadores

| Contador | Valor observado | Fonte | Status neste inventário |
| --- | --- | --- | --- |
| Unassigned | 60 | aba do scan | não reconciliável registro a registro sem export/acesso; universo aproximado |
| Resolved (aba) | 10 | aba do scan | compatível com os ~9 sfinds citados nos corpos dos PRs 475/477/479/480 + 2 sem ID citado (476/478); hipótese, não prova |
| Merged | 6 | aba do scan | **confirmado**: PRs 475, 476, 477, 478, 479, 480, todos merged em 21–22/09/2026 (gh API + `git log origin/main`) |
| Header open/resolved | 65 open · 3 resolved | cabeçalho do scan | divergente das abas; scan em estado `Failed`. §3A reconstrói a cobertura a partir dos registros nomeados; fechamento 1:1 aguarda exportação dos registros (needs-info no ticket) |
| High + Unassigned | 0 itens | filtro do scan | compatível com o único high identificado (`sfind-e75c75…`, biblioteca) já resolvido pelo PR 477; mensagem histórica de "8 high" descartada |
| Registros 1:1 exportados | 0 | — | não houve exportação integral; o inventário classifica grupos de causa + sfinds citados em PRs |

Reconciliação pendente: os contadores observados não estabelecem quantos registros únicos
foram cobertos. Os seis PRs têm merge confirmado, mas falta o vínculo individual entre cada
registro do scan, sua classificação e a correção correspondente. Exportar ou ler todos os IDs
e títulos existentes antes de concluir cobertura; um novo scan é complementar e não substitui
a reconciliação dos registros originais.

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

**Cobertura não quantificada:** a enumeração local não comprova 63 registros do scan nem
uma lacuna de 6–7 registros. Também não comprova a correspondência de 9–10 registros com
Resolved. Essas estimativas da v2 ficam retiradas. O total coberto e a lacuna permanecem
indeterminados até conferir os IDs reais, eliminar sobreposições e relacionar cada registro
a um ticket ou à evidência de correção. A issue permanece aberta, aguardando informação.

## 4. Duplicatas consolidadas

- Billing history: 2 registros → 1 causa → ticket 497.
- Funnel `listUsageEventsForOwner`: 2 registros → 1 causa → ticket 498.
- Scan 479: `sfind-094c64f6…` + agrupado `sfind-df9f4f0d…` → 1 fix (PR 479).
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
   bloqueados pela issue 481 aberta.** A tabela é orientação preliminar de escopo, não autorização
   de desbloqueio. Quando o inventário estiver concluído, revalidar os itens de evidência
   insuficiente antes de implementar; os tickets originalmente sem dependência não mudam.
5. **Exportar os registros do scan** (títulos/IDs dos ~60 unassigned + resolved) e comparar com
   §3A para fechar o 1:1 e a divergência 60/65 e 10/3 — pedido `needs-info` no ticket, depende de
   acesso ao Devin. Re-rodar o scan (estado `Failed`) é complementar, não substituto da exportação.

## 6. Limites

- Nenhum deploy, migration remota, chamada paga, exclusão de dados ou alteração de status no Devin.
- Mudanças de API/schema/armazenamento nos tickets seguem exigindo proposta e aprovação próprias.
- Evidência local (leitura + 133 testes verdes) não equivale a ganho em produção.

## 7. Changelog

- v3 (22/09/2026): retiradas contagens especulativas de cobertura/lacuna; adapters não contam
  como findings individuais; dependentes permanecem bloqueados pela issue 481 aberta.

- v2 (22/09/2026): pós-revisão — escopo #494 corrigido (`runReconcile` + chunks), missões como
  2 rodadas paralelas e enumeração local; as estimativas de cobertura dessa versão foram
  retiradas na v3. Fechamento 1:1 pendente de exportação dos registros.
- v1 (22/09/2026): inventário inicial em 27 linhas de causa; superseded.
