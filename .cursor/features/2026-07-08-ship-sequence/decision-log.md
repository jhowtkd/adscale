# Decision log — 2026-07-08-ship-sequence

## T1 — Triage residual uncommitted (2026-07-08)

**Decision:** `commit_hygiene` — um commit docs/ops com os artefatos abaixo; depois working tree limpa para F2.

| Path | Diff | Destino | Por quê |
|------|------|---------|---------|
| `128-BASELINE.md` / `128-EVIDENCE.json` / `128-VERIFICATION.md` | Só timestamps `2026-07-04` → `2026-07-08`; status continua `passed` | **Commit** | Refresh de evidência; padrão do repo (`6a16b968`, `5bd81245`) |
| `.planning/ops/beta-feedback-daily/2026-07-08.md` | Novo daily (0 items; coleta parcial/fallback) | **Commit** | Série diária já versionada; registra gap da fonte SQL no Render |
| `.cursor/features/2026-07-08-ship-sequence/*` | Plano desta sequência (spec/plan/tasks/state) | **Commit no mesmo hygiene** | Rastreabilidade do ship; evita lixo local |

**Não descartar:** beta daily documenta falha operacional da coleta SQL — útil.

**Não misturar:** dual-engine / UX app code já está nos 20 commits; hygiene fica separado.
