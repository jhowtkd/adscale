# Agente B — Contratos, persistência e reserva (2026-09-10)

## Base e branches

- Agente / branch / worktree: B / `codex/estudio-contratos` / `.worktrees/estudio-contratos`
- BASE_COMUM oficial: `3063ff4a8c8bad1091d2876a070314e7653c922a` (incorporada por merge `e1d1276e`, sem rebase; base anterior `ac38a30e` preservada na ancestry).
- B1: `e38b53077d1d02021d688996eea1e3ad87c8f8a1` — `feat: persist output review drafts with revision checks` (preservado).
- B2: `be4451bcbce050ec894f99102496636cfcd83b65` — `feat: generate reviewed revisions in the same creative work` (preservado).
- Correções desta entrega: novo commit `fix: validate persisted review payloads, resume replayed revisions, recover R1 marker` (ver `git log`).
- Revisão `3470fee9` (coordenador): novo commit abaixo com os dois P2 restantes + adoção do helper aprovado de D.

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

- Novo: `app/src/server/creative-work/output-review.ts` + teste; novo `output-projection.ts` (DTO público compartilhado GET/POST, sem teste próprio — coberto nos testes de rota).
- `app/src/server/db/schema.ts`, `app/drizzle/0095_output_review.sql`, `app/drizzle/meta/_journal.json`.
- `app/src/server/db/schema.ts`, `app/drizzle/0095_output_review.sql`, `app/drizzle/meta/_journal.json`.
- Novo: `app/src/server/repositories/creative-work-output-review.ts`; `app/src/server/repositories/creative-work.ts` + teste.
- Novo: `app/src/server/application/save-creative-work-output-review.ts` + teste; `revise-creative-work-output.ts` + teste; `retry-creative-work-output.test.ts` (verificado, sem mudança).
- `app/src/server/generation/settlement-adapters.ts` + teste.
- `app/src/app/api/creative-work/[id]/route.ts` + teste; `[id]/generate/route.ts` + teste.
- `CONTEXT.md`, `docs/decisions/2026-09-10-estudio-peca-na-caixa.md`, este relatório.

Não editados: `contracts.ts`, `protocol.ts`, `jobs/creative-work.ts`, `prepare`, hooks/UI, billing, traduções, E2E.

## Comandos + resultados

```bash
npm test -- src/server/creative-work/output-review.test.ts src/server/repositories/creative-work.test.ts src/server/application/save-creative-work-output-review.test.ts src/server/application/revise-creative-work-output.test.ts src/server/application/retry-creative-work-output.test.ts src/server/application/refund-creative-work-output.test.ts src/server/generation/settlement-adapters.test.ts 'src/app/api/creative-work/[id]/route.test.ts' 'src/app/api/creative-work/[id]/generate/route.test.ts'
# 9 arquivos, 403 testes, todos PASS (inclui suíte do helper de D, só leitura).

npm run typecheck
# PASS, sem erros.
```

Cobertura exigida:

- CAS409 sem escrita/charge/dispatch: `review_conflict`/`stale_review` com `txSet` único e `settle` zerado.
- Isolamento workspace: `not_found` com zero updates.
- Retomar draft: save revisão 1 + GET projeta `reviewDraft`.
- Replay depois de editar draft: operação existente retoma o settlement com contexto congelado (adapter recebe contexto/instrução da linha, nunca relê o draft); `dispatch_failed` compensa sem segunda cobrança.
- Output único por chave: mesma chave + mesmo contexto → mesmo id; outra base/contexto → conflito sem insert.
- Formato correto: filha `9:16`, pai `4:5` intacto; `targetFormat` no lock/maxVersion/insert.
- Crédito único: `chargeBatch` uma vez; replay sem charge.
- Claim atômico 1/2: `lt(image_call_count, maxCalls)` com params `[..., 1]` e `[..., 2]`.

## Correções pós-revisão (coordenador, sem amend/rebase)

- **B1 parser (P2):** GET e reserva validam `reviewDraft`/`revisionContext` persistidos com os schemas estritos; nulo histórico preservado, inválido rejeitado (GET projeta null, save/reserva retornam conflito) sem reset/overwrite; extras privados nunca atravessam. Regressões de campo extra e versão/revision inválida.
- **B2 replay (P1):** replay por `operationKey` retoma o settlement canônico com o contexto/instrução CONGELADOS da linha existente (validados), sem reler draft editado; `dispatch_failed` propaga compensação pendente; sem segunda cobrança (kernel faz join, não charge, em reserva não reclamada).
- **B2 após 402 (P2):** reserva re-enfileira (failed→queued, mesmo `operationKey`) somente filhos `failed/credit_blocked` coincidentes e reclama dispatch: mesma chave, uma cobrança (chave de billing por output), uma geração; concorrentes perdem o CAS e fazem join no vencedor; comando divergente conflita sem insert.
- **B2 DTO (P2):** `reviewed_revision` responde o projetor público compartilhado com o GET (`output-projection.ts`); sentinelas `outputKey/operationKey/storageKey/camadas` ausentes; drafts validados.
- **R1 (B):** `completeCreativeWorkOutput` aceita opção interna que marca `objective_quality_failed_refund_pending` no mesmo CAS (perdedor retorna null, sem refund); `listCreativeWorkOutputsNeedingRefund` preserva a regra failed e soma OR exato (completed + marcador + verdict fail + imagem); `clearCreativeWorkOutputObjectiveQualityRefundPending` limpa só o marcador com CAS exato preservando imagem/quality/terminal; GET recupera o caso novo com fase terminal + ator autenticado e limpa após liquidação confirmada; falha mantém o marcador para job/onFailure/GET retomarem.
- **Pendente D:** ~~GET consome o helper compartilhado `refund-creative-work-output.ts` assim que o SHA real for distribuído (troca mecânica de uma chamada local de mesma assinatura; nenhum stub criado neste branch).~~ RESOLVIDO: helper aprovado e isolado em `a822f2f3` (cherry-pick -x de `167ab700`), incorporado por merge; GET importa `refundCreativeWorkOutputCompensatory` e a duplicação local foi removida.

## Segunda rodada (revisão de `3470fee9`)

- **P2 replay:** `reviseReviewedOutput` exige contexto congelado válido (schema estrito + mesma `reviewRevision` + instrução presente); inválido rejeita como `invalid_revision`, sem fallback legado. Teste com instrução válida e contexto `version:2`/campo extra.
- **P2 retomada 402:** re-queue renova `updatedAt`, limpa `terminalAt` e reemite `queuedAt` (lease não vence no GET seguinte); chave e contadores preservados; perdedor do CAS faz join.
- **GET + helper D:** merge `a822f2f3` por merge (só docs de coordenação, parcial A já revisada e os 2 arquivos do helper); rota importa o helper real; suíte da rota convertida para asserir roteamento (helper chamado com fase terminal + `userId` no caso R1, limpeza só após `true`).
- Lint: `npx --no-install eslint` nos arquivos tocados — 0 erros (5 warnings pré-existentes em destructures `_` do carrossel).

## Contratos consumidos/produzidos

- Consome: `getCreativeWork`, `getWorkspaceAssetById`, `creativeWorkFormatSchema`, `GENERATION_CREDIT_COSTS.creativeWorkOutput`, `canonicalJsonStringify`.
- Produz: `OutputReviewInput/DraftV1/ContextV1`, `compileOutputReview`, `saveCreativeWorkOutputReview`, PATCH `saveOutputReview`, POST `reviewed_revision`, `SourceAssetDetails` com `width/height`, `claim...maxCalls`.

## Pedidos entre agentes

- A: ligar `revisionContext.action` ao modo do job (`format_adaptation` vs `creative_revision`); usar `output.targetFormat` para dimensões e pai como primeira referência; não editar backend de B.
- C: pode consumir B1 (GET + custo) via merge do SHA B1; nenhum stub de produção necessário.
- D: prova E2E de corridas após integração; banco/migração real somente isolados e autorizados.

## Evidência local e limitações

- Unitários com mocks; sem rede/pagos. Prova transacional real e E2E ficam para D após integrar (tarefa 7 do plano).
- Migração não aplicada em banco não isolado; `db:push` não executado. Nenhuma migration nova nesta entrega (marcador R1 usa `failureCode` existente).
- Lint (`npx --no-install eslint` dentro de `app/`, sem pacote novo): 0 erros nos arquivos tocados; 5 warnings pré-existentes em destructures `_` do carrossel. Typecheck + 403 testes + `git diff --check` verdes.
- Produção/chamadas pagas: não executadas.
