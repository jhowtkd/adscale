---
gsd_state_version: 1.0
milestone: v12.1
last_activity: 2026-06-12 — Migrations 0037-0040 applied; browser UAT complete; QA-13 signed off; v12.1-MILESTONE-AUDIT.md updated to `passed`
**Current milestone:** v12.1 Memória Criativa e Aprendizado de Performance
v12.1 phases 103–108 complete. All 31 requirements evidenced (30 automated + 1 human UAT). Migrations applied to local Postgres; staging/prod apply remains a deploy gate. Ready for `gsd-complete-milestone`.
Last activity: 2026-06-12 — Migrations applied; UAT E2E pass; QA-13 + audit flipped to passed

## Last completed milestone

| Milestone | Phases | Shipped | Archive |
|-----------|--------|---------|---------|
| v12.0 Monetização Real | 97–102 | 2026-06-11 | [ROADMAP](milestones/v12.0-ROADMAP.md) · [REQUIREMENTS](milestones/v12.0-REQUIREMENTS.md) · [AUDIT](milestones/v12.0-MILESTONE-AUDIT.md) |

## Release gate (last verified)

- `npm test` — **1182 passed** (1 skipped)
- `npm run lint` — **0 errors** (69 warnings pre-existing)
- `npm run build` — OK

## Human gates before ship

1. Apply migrations `0037`–`0040` on target Postgres (`cd app && npm run db:migrate`).
2. Browser UAT: import → compare → learnings → recommendation → editable recipe prefill.
3. Run `gsd-audit-milestone` / `complete-milestone` after UAT sign-off.

## Known follow-ups (non-blocking)

1. BillingTab may show stale "Inativo" after checkout redirect while API returns `active`.
2. Production Render still on Stripe **test** keys until live cutover.

## Milestone Goal

Associar hipóteses e derivações a resultados importados manualmente/CSV, identificar padrões por cliente e recomendar a próxima ação com evidência, amostra e confiança explícitas.

## Decisions

- Phase 105: Verdicts deterministic with 1000-impression floor and 5% relative gap for winner declaration.
- Phase 105: Campaign objective required as minimum comparability context.
- Phase 106: Postgres owns canonical learnings; Mem0 stores `performance_learning` projections with `learningId` metadata.
- Phase 106: Learning algorithm version `1.0.0`; auto-recompute after comparison and import confirm.
- Phase 107: Recommendations are deterministic from approved learnings; accept/edit only opens Strategy Recipe with prefill.
- Phase 107: `next_experiment_*` analytics events track view, accept, edit, dismiss.
- Phase 108: QA-13 migration apply and browser UAT are explicit human gates, not silent pass.

## Next action

Complete human UAT + migration apply, then run `gsd-audit-milestone` or `complete-milestone` for v12.1.
