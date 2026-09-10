# Agente B — Contratos, persistência e reserva (2026-09-10)

## Base e branches

- Agente / branch / worktree: B / `codex/estudio-contratos` / `.worktrees/estudio-contratos`
- BASE_COMUM: `ac38a30e4611ee62d534b34a2b80579dbfe893d3` (`feat/f03-commercial-offer-catalog`)
- B1: `e38b53077d1d02021d688996eea1e3ad87c8f8a1` — `feat: persist output review drafts with revision checks`
- B2: HEAD desta branch (`feat: generate reviewed revisions in the same creative work`; ver `git log` para SHA final após amend de evidência).

## Tarefas concluídas

- Plano experiência tarefas 1–2 (backend, sem job/protocol de A):
  - `output-review.ts`: schemas puros, `compileOutputReview`, limites 8/100/800/2000, `canReviewOutputDraft`.
  - Migração `0095_output_review` + `schema.ts`: `review_draft`/`revision_context` nullable.
  - `saveOutputReviewDraft` com CAS próprio, sem tocar `updatedAt`; referência validada no mesmo workspace.
  - `saveCreativeWorkOutputReview` + custo canônico `GENERATION_CREDIT_COSTS.creativeWorkOutput`.
  - PATCH `saveOutputReview` (400/404/409) e GET com `reviewDraft`, `revisionContext`, `revisionCreditCost`, sem chaves privadas.
  - `claimCreativeWorkOutputImageCall(..., maxCalls: 1|2 = CREATIVE_WORK_MAX_IMAGE_CALLS)` compatível.
  - `getCreativeWorkSourceAssetDetails` projeta `width/height` existentes.
- Plano qualidade tarefa 3 (repositório/retry):
  - Claim atômico 1/2 preservado; retry técnico existente verificado sem reset de `imageCallCount`.
- Plano confiabilidade tarefa 3 (somente projeção):
  - Dimensões incluídas sem mudar schema/API pública.
- B2 reserva:
  - `createCreativeWorkRevision(..., {context, expectedReviewRevision})`: `targetFormat` da filha no lock, `maxVersion`, replay e insert; igualdade via `canonicalJsonStringify`; replay antecede CAS para permitir replay após edição; chave com outra base/contexto conflita sem cobrança; CAS sob lock relê `reviewDraft`.
  - `creativeWorkRevisionSettlementAdapter` aceita `context/expectedReviewRevision` sem segundo settlement.
  - `reviseCreativeWorkOutput` aceita `reviewed_revision` (`outputId/reviewRevision/revisionKey/expectedCredits`); políticas antigas de `revision` continuam pelo mesmo serviço.
  - POST `reviewed_revision` (202/400/404/409/402/502); `revisionInstruction` é compilação de texto/notas; pai intacto; `work.toolKind` inalterado.

## Arquivos alterados (somente ownership B)

- Novo: `app/src/server/creative-work/output-review.ts` + teste.
- `app/src/server/db/schema.ts`, `app/drizzle/0095_output_review.sql`, `app/drizzle/meta/_journal.json`.
- Novo: `app/src/server/repositories/creative-work-output-review.ts`; `app/src/server/repositories/creative-work.ts` + teste.
- Novo: `app/src/server/application/save-creative-work-output-review.ts` + teste; `revise-creative-work-output.ts` + teste; `retry-creative-work-output.test.ts` (verificado, sem mudança).
- `app/src/server/generation/settlement-adapters.ts` + teste.
- `app/src/app/api/creative-work/[id]/route.ts` + teste; `[id]/generate/route.ts` + teste.
- `CONTEXT.md`, `docs/decisions/2026-09-10-estudio-peca-na-caixa.md`, este relatório.

Não editados: `contracts.ts`, `protocol.ts`, `jobs/creative-work.ts`, `prepare`, hooks/UI, billing, traduções, E2E.

## Comandos + resultados

```bash
npm test -- src/server/creative-work/output-review.test.ts src/server/repositories/creative-work.test.ts src/server/application/save-creative-work-output-review.test.ts src/server/application/revise-creative-work-output.test.ts src/server/application/retry-creative-work-output.test.ts src/server/generation/settlement-adapters.test.ts 'src/app/api/creative-work/[id]/route.test.ts' 'src/app/api/creative-work/[id]/generate/route.test.ts'
# 8 arquivos, 380 testes, todos PASS.

npm run typecheck
# PASS, sem erros.
```

Cobertura exigida:

- CAS409 sem escrita/charge/dispatch: `review_conflict`/`stale_review` com `txSet` único e `settle` zerado.
- Isolamento workspace: `not_found` com zero updates.
- Retomar draft: save revisão 1 + GET projeta `reviewDraft`.
- Replay depois de editar draft: operação existente retorna mesmo output sem `settle`.
- Output único por chave: mesma chave + mesmo contexto → mesmo id; outra base/contexto → conflito sem insert.
- Formato correto: filha `9:16`, pai `4:5` intacto; `targetFormat` no lock/maxVersion/insert.
- Crédito único: `chargeBatch` uma vez; replay sem charge.
- Claim atômico 1/2: `lt(image_call_count, maxCalls)` com params `[..., 1]` e `[..., 2]`.

## Contratos consumidos/produzidos

- Consome: `getCreativeWork`, `getWorkspaceAssetById`, `creativeWorkFormatSchema`, `GENERATION_CREDIT_COSTS.creativeWorkOutput`, `canonicalJsonStringify`.
- Produz: `OutputReviewInput/DraftV1/ContextV1`, `compileOutputReview`, `saveCreativeWorkOutputReview`, PATCH `saveOutputReview`, POST `reviewed_revision`, `SourceAssetDetails` com `width/height`, `claim...maxCalls`.

## Pedidos entre agentes

- A: ligar `revisionContext.action` ao modo do job (`format_adaptation` vs `creative_revision`); usar `output.targetFormat` para dimensões e pai como primeira referência; não editar backend de B.
- C: pode consumir B1 (GET + custo) via merge do SHA B1; nenhum stub de produção necessário.
- D: prova E2E de corridas após integração; banco/migração real somente isolados e autorizados.

## Evidência local e limitações

- Unitários com mocks; sem rede/pagos. Prova transacional real e E2E ficam para D após integrar (tarefa 7 do plano).
- Migração não aplicada em banco não isolado; `db:push` não executado.
- Produção/chamadas pagas: não executadas.
