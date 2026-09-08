# Studio caixa unificada — evidência Task 6

Data: 2026-09-08. Branch: `codex/studio-caixa-unificada`.
Base verificada: `e6a775c8 feat(studio): switch between inspirations and scoped production`.
O commit desta task é o que inclui este arquivo.

## Ambiente

- Runner sanitizado: `python3 /private/tmp/adscale-studio-e2e-run.py` (cwd `app/`).
- Fake keys; `OPENAI_BASE_URL=http://127.0.0.1:9/v1` (bloqueio local do SDK; não removido).
- `APP_URL=http://localhost:3106`, `E2E_CONTROLLED_PROVIDER=true`, `E2E_DISABLE_RATE_LIMIT=true`, `TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test`.
- Next: build otimizado local (`npm run build`) e `npx next start --hostname 127.0.0.1 --port 3106`. Inngest existente em `127.0.0.1:8291` (não reiniciado).
- `GET /api/health` → `{"ok":true}` após o start.
- Aviso do Next: `next start` com `output: standalone`; o processo ficou Ready e atendeu health. Sem deploy.
- Seed local: `npm run seed:create-post-e2e` via o mesmo runner (pré-condição de saldo, não billing de produto).
- CUA/capturas Codex: `docs/screenshots/studio-caixa-unificada/` (`mesa-desktop.png`, `caixa-variacoes.png`, `caixa-restyle.png`, `caixa-carrossel.png`, `producao.png`, `caixa-mobile.png`, `producao-vazia.png`). Graphify fica com o Codex no fechamento.

## Correções desta task (além do acabamento visual já no WIP)

- Produção: botão **Próximas peças** desativado na última página sem cursor (`hasBufferedNextPage` / `hasRemoteNextPage`).
- Seed insufficient: o grant `signup_trial` deixou de ser apagado (o login recriava `TRIAL_CREDIT_GRANT` = 500). `activateSignupTrial` + `remaining = 0`.
- Guards canônicos 409 preservados: cache de revisão; em conflito, `blockStaleRevision` + refresh + throw; sem replay cego.

## Checks que passaram

| Check | Resultado |
| --- | --- |
| `npm run build` (webpack) | PASS (~55s) |
| Vitest combinado Tasks 1–6 + composers + ResumeSurface | **12 files / 307 tests PASS** |
| `npm run typecheck` | PASS |
| ESLint nos TS/TSX alterados | 0 errors (3 warnings preexistentes de hooks) |
| `git diff --check` | limpo |
| E2E `mesa alterna e caixa recolhe sem gerar ou perder o pedido` | **PASS** (3.1s, build otimizado) |
| Sidebar insufficient após seed | **0 créditos** (achado 17 corrigido no seed) |
| E2E insufficient: POST `/generate` | **402**; alerta de crédito visível; `outputs.length === 0` |

## Falhas remanescentes (preexistentes / ambiente; não mascaradas)

### 409 de revisão (achado 16) — sem retry cego

Trace desktop otimizado (`postData._sha1`, sem cookies): análise principal **Análise concluída**; `PATCH` autosave **409** `stale_input` com `expectedUpdatedAt=2026-09-08T20:48:21.256Z`; autosave seguinte **200** com revisão `20:48:21.634Z`. A UI mostra “Algo deu errado. Tente novamente.” Prepare/plano não abre. O job auxiliar `workspace-asset.ts` (OpenAI direto, base `:9`) é distinto da análise principal (seam `e2e-controlled`).

Trace source (ronda anterior): `attachSource` 200 → autosave 409; segundo attach 200; `retrySource` 200; `removeSource` 409 `stale_input` com `expectedUpdatedAt=20:22:54.105Z` após refetch da fonte pronta. Análise em background muda `updatedAt`; o cache canônico não é tratado como permissão de replay.

Geometria `assertStableTalkBox` (top ≥ 0, base ≤ 2px, teclado, mobile CTA vs nav) correu até Gerar nos casos accessible; o bloqueio seguinte é o 409 acima, não o painel vazio original.

### Insufficient: igualdade profunda do work após 402

402 e zero outputs passam. `afterBlock.work` difere: `identitySnapshot` nulo → preenchido, `status` draft → ready, `updatedAt` sobe. Isso ocorre em `generateCreativeWork` **antes** do `credit_blocked` (rascunho single/primeira visita). Fora do escopo de UI/cobrança desta task; asserção de negócio mantida.

### Carousel E2E

`creates, generates, repairs, approves and exports the deck` **FAIL**: rádio “Criar carrossel” fica checked e o compositor monta, mas não há `POST /api/creative-work`; `workId` permanece null; “Organizar conteúdo” disabled. Sem replay. Codex CUA anterior (achado 7) gerou 5/5 no provider controlado; o Playwright desta ronda não prova o gate.

### Accessible desktop/mobile

Mesmo padrão 409 após análise concluída; plano não visível. Não reexecutado em loop de compile.

## Não executado / fora

- Graphify (Codex no fechamento).
- Push/PR, produção, providers pagos, `.env` real.
- Fixture `create-post-e2e.json` e planos em `docs/plans` / `docs/superpowers/plans` ficam fora do staging (WIP de seed/coordenação).
