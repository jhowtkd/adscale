# Studio caixa unificada — evidência Task 6

Data: 2026-09-08. Branch: `codex/studio-caixa-unificada`.
Base verificada: `9b594c2d test(studio): verify unified composer and production desk` (preservado).
O commit desta continuação é o que inclui este arquivo.

## Ambiente

- Runner sanitizado: `python3 /private/tmp/adscale-studio-e2e-run.py` (cwd `app/`).
- Fake keys; `OPENAI_BASE_URL=http://127.0.0.1:9/v1` (bloqueio local do SDK; não removido).
- `APP_URL=http://localhost:3106`, `E2E_CONTROLLED_PROVIDER=true`, `E2E_DISABLE_RATE_LIMIT=true`, `TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test`.
- Next: build otimizado local (`npm run build`) e `npx next start --hostname 127.0.0.1 --port 3106`. Inngest existente em `127.0.0.1:8291` (não reiniciado; PID inngest preservado).
- `GET /api/health` → `{"ok":true}` após o start.
- Sem reseed; sem publicar; sem provider pago.

## Correções desta continuação

- `resolveObservedCanonicalRevision` absorve GET/poll mais novo **somente** quando não há `refreshRequiredWorkId === workItemId`. Bloqueio 409 devolve `revision: null` e state intacto; o hook obrigatoriamente chama `refreshCanonicalWorkRevision`. Após refetch, `applyCanonicalWorkRevision` limpa o bloqueio.
- Primeira visita: focar/expandir a caixa revela os rádios de protocolo (`hasStartedRequest`).
- Mesa `inert` + `pointer-events: none` enquanto os resultados estão visíveis, para não interceptar Conservadora/Aprovar.
- E2E: protocolo antes do pedido no carrossel; pedido pelo teclado no accessible; variações no insufficient; seletores `Refinar` / `Análise concluída`.

## Checks

| Check | Resultado |
| --- | --- |
| Vitest afetado (revision, gaps, TalkBox, BrandStageHome, DashboardHomeActions, composer-state) | **6 files / 115 PASS** |
| `npm run build` (webpack) | PASS |
| Typecheck (no build) | PASS |
| ESLint nos TS/TSX alterados | 0 errors (1 warning preexistente: `composer` em `DashboardHomeActions.tsx:258`) |
| E2E carousel gate | **PASS** 8.8s |
| E2E confirmação explícita | **PASS** 4.2s |
| E2E source failures | **PASS** 5.1s |
| E2E insufficient (variações, rádio checked, `toolKind=variations`, 402) | **PASS** 3.0s |
| E2E accessible desktop | **PASS** 6.8s |
| E2E accessible mobile | **PASS** 6.5s |
| E2E mesa/caixa | **PASS** 2.5s |
| Suite Task 6 (7 casos) | **7 passed (37.6s)** |

## Limitação provada (não mascarada)

`generateCreativeWork` grava `identitySnapshot`, `status: ready` e um `preparedRevision` novo **antes** de `credit_blocked`. No cenário de variações: 402, `outputs.length === 0`, `sources` iguais, `id`/`request`/`toolKind` iguais. Billing de produto não foi alterado. A asserção profunda de `work`/`preparedPlan` ignora só esses campos de bookkeeping do generate.

## Fora

- Graphify: Codex já rodou e atualiza depois deste diff.
- Push/PR, produção, providers pagos, `.env` real.
- Fixture `create-post-e2e.json` e planos em `docs/plans` / `docs/superpowers/plans` ficam fora do staging.
