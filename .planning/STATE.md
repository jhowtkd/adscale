---
gsd_state_version: 1.0
milestone: v12.1
milestone_name: Memória Criativa e Aprendizado de Performance
status: ready_to_close
last_updated: "2026-06-12T19:05:00Z"
last_activity: 2026-06-12 — Product-pure re-UAT passed (11/11); QA-13 closed; staging migrate remains deploy gate
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 13
  completed_plans: 13
---

# Project State

**Last updated:** 2026-06-12
**Current milestone:** v12.1 Memória Criativa e Aprendizado de Performance
**Status:** ready_to_close — product-pure UAT passed; staging migrate before ship

## Summary

Phases 103–108 complete. Product-pure re-UAT passed (`re-uat-v12.1-product.mjs`, 11/11). PATCH `clientProfileId` and `db:migrate` fixes verified. Staging/prod migration apply is the remaining deploy gate before `gsd-complete-milestone`.

## Current Position

Phase: 108 — Performance Learning Release Gate
Plan: 01 (complete)
Status: Passed (product-pure re-UAT)
Last activity: 2026-06-12 — `re-uat-v12.1-product.mjs` 11/11 green

## Last completed milestone

| Milestone | Phases | Shipped | Archive |
|-----------|--------|---------|---------|
| v12.0 Monetização Real | 97–102 | 2026-06-11 | [ROADMAP](milestones/v12.0-ROADMAP.md) · [REQUIREMENTS](milestones/v12.0-REQUIREMENTS.md) · [AUDIT](milestones/v12.0-MILESTONE-AUDIT.md) |

## Release gate (last verified)

- `npm test` — **1182 passed** (1 skipped)
- `npm run lint` — **0 errors** (69 warnings pre-existing)
- `npm run build` — OK

## Human gates before ship

1. ✅ Local: migrations 0037–0040 applied (initial UAT workaround).
2. ☐ Staging/prod: `npm run db:migrate` with fixed migrator script.
3. ✅ Product-pure re-UAT: PATCH `clientProfileId` + Accept → Strategy Recipe (2026-06-12).
4. ☐ Staging/prod: `npm run db:migrate`.
5. Run `gsd-complete-milestone` after gate 4.

## Known follow-ups

1. ~~`drizzle-kit migrate` silent failure~~ — fixed in `migrate-with-retry.mjs` (2026-06-12).
2. ~~PATCH `clientProfileId`~~ — fixed in campaigns route + test (2026-06-12).
3. BillingTab may show stale "Inativo" after checkout redirect while API returns `active`.
4. Production Render still on Stripe **test** keys until live cutover.

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

Run `gsd-complete-milestone` for v12.1, then apply migrations on staging/prod before deploy.
