# Studio caixa unificada — evidência Task 6

Data: 2026-09-08. Branch: `codex/studio-caixa-unificada`.
Base verificada: `9b594c2d test(studio): verify unified composer and production desk` e `8211d45c fix(studio): absorb newer work revision without clearing a 409 block` (preservados).
O commit desta continuação é o que inclui este arquivo.

## Ambiente

- Runner sanitizado: `python3 /private/tmp/adscale-studio-e2e-run.py` (cwd `app/`).
- Fake keys; `OPENAI_BASE_URL=http://127.0.0.1:9/v1` (bloqueio local do SDK; não removido).
- `APP_URL=http://localhost:3106`, `E2E_CONTROLLED_PROVIDER=true`, `E2E_DISABLE_RATE_LIMIT=true`, `TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test`.
- Next: nova build otimizada local (`npm run build`) e `npx next start --hostname 127.0.0.1 --port 3106` após alteração de fonte. Inngest existente em `127.0.0.1:8291` (não reiniciado).
- `GET /api/health` → `{"ok":true}` após o start.
- Sem reseed; sem publicar; sem provider pago.

## Correções desta continuação

1. Custo canônico: `frictionless-home.spec.ts` volta a exigir igualdade com `quoteCreativeWork({ intent: "variations", format: "4:5", targetFormats: [] }).credits` (150 = 3 × `GENERATION_CREDIT_COSTS.creativeWorkOutput`). Mantém `toHaveLength(1)`. O seed deriva `expectedInitialCredits` do mesmo contrato; billing de produto não foi alterado. A fixture local `15` não foi commitada nem usada como expectativa.
2. Preservação após 402: compara **todos** os campos de `work` exceto `identitySnapshot` / `status` / `updatedAt`; plano inteiro exceto `preparedRevision`. Exige `status === "ready"`, snapshot com `clientProfileId`/`confirmedAt`/`assets`, `updatedAt` mais novo e `preparedRevision` distinta. Fontes iguais; `outputs.length === 0`. Saldo (`/api/billing/status` `creditBalance`), grants e usage inalterados (sem débito). Sidebar permanece `0 créditos`.
3. Visual: mesa **não** fica `inert` em `resultsActive`; mosaic **não** usa `display: none`. Resultados voltam a ser irmão do workspace. Stacking/clipping: `isolation` no workspace e `overflow: clip` na mesa ocupada, com `min-height` real. Switcher Produção após gerar mostra peças no mosaic. Captura `docs/screenshots/studio-caixa-unificada/resultado-home.png` após rolar até Conservadora; E2E exige bounding boxes dos cartazes sem interseção com a superfície de resultados.

## Checks

| Check | Resultado |
| --- | --- |
| Vitest combinado Tasks 1–6 + `composer-revision` + `detect-entry-gaps` | **14 files / 327 PASS** |
| `useCreativeComposer.test.tsx` (incluído) | **125 PASS** |
| `npm run build` (webpack) | PASS |
| Typecheck | PASS |
| ESLint nos TS/TSX alterados | 0 errors (1 warning preexistente: `composer` em `DashboardHomeActions.tsx:258`) |
| `git diff --check` | PASS |
| E2E carousel gate | **PASS** 8.3s |
| E2E confirmação explícita (custo 150, Produção com peças, captura) | **PASS** 5.0s |
| E2E source failures (custo 150, débito único) | **PASS** 6.2s |
| E2E insufficient (variações, 402, work/plano/billing) | **PASS** 3.4s |
| E2E accessible desktop | **PASS** 6.7s |
| E2E accessible mobile | **PASS** 6.5s |
| E2E mesa/caixa | **PASS** 1.7s |
| Suite Task 6 (7 casos) | **7 passed** |

## Exceções reais na preservação 402 (não igualdade profunda total)

`generateCreativeWork` confirma identidade **antes** de `credit_blocked`: `identitySnapshot` passa a existir, `status` vai a `ready`, `updatedAt` avança e o plano recebe `preparedRevision` nova. Os demais campos de `work` e o restante do plano ficam iguais. Usage/grants/saldo não mudam. Billing de produto não foi alterado para adaptar fixture.

## Visual

Captura em `docs/screenshots/studio-caixa-unificada/resultado-home.png`: superfície de resultados (miniaturas, Conservadora, Aprovar) sem cartazes da mesa por cima. Mosaic permanece montado e clicável; Produção troca as peças visíveis.

## Fora

- Graphify e cleanup da fixture: Codex.
- Push/PR, produção, providers pagos, `.env` real.
- Fixture `create-post-e2e.json` e planos em `docs/plans` / `docs/superpowers/plans` ficam fora do staging.
