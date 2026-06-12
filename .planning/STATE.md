---
gsd_state_version: 1.0
milestone: v12.1
milestone_name: Memória Criativa e Aprendizado de Performance
status: ready_to_close
last_updated: "2026-06-12T14:10:00Z"
last_activity: 2026-06-12 — Migrations 0037–0040 applied (local); browser/API UAT complete; QA-13 signed off; audit `passed`
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 13
  completed_plans: 13
---

# Project State

**Last updated:** 2026-06-12
**Current milestone:** v12.1 Memória Criativa e Aprendizado de Performance
**Status:** Ready to close (`gsd-complete-milestone`)

## Summary

Phases 103–108 complete. All 31 requirements evidenced (automated + human UAT on local Postgres). Staging/prod migration apply remains a deploy gate. Two non-blocking defects logged in audit (drizzle migrate silent failure; PATCH clientProfileId).

## Current Position

Phase: 108 — Performance Learning Release Gate
Plan: 01 (complete)
Status: Passed (local migrations + UAT)
Last activity: 2026-06-12 — QA-13 closed; `v12.1-MILESTONE-AUDIT.md` → `passed`

## Last completed milestone

| Milestone | Phases | Shipped | Archive |
|-----------|--------|---------|---------|
| v12.0 Monetização Real | 97–102 | 2026-06-11 | [ROADMAP](milestones/v12.0-ROADMAP.md) · [REQUIREMENTS](milestones/v12.0-REQUIREMENTS.md) · [AUDIT](milestones/v12.0-MILESTONE-AUDIT.md) |

## Release gate (last verified)

- `npm test` — **1182 passed** (1 skipped)
- `npm run lint` — **0 errors** (69 warnings pre-existing)
- `npm run build` — OK

## Human gates before ship

1. ✅ Local: migrations 0037–0040 applied; UAT E2E (import → compare → learnings → recommendation).
2. ☐ Staging/prod: apply migrations after fixing drizzle-kit silent-failure on existing schema.
3. Run `gsd-complete-milestone` to archive v12.1.

## Known follow-ups (non-blocking)

1. `drizzle-kit migrate` fails silently when `adscale_app` schema already exists — use migrator workaround or preflight.
2. `PATCH /api/campaigns/[id]` may not persist `clientProfileId` — investigate route DTO/update set.
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
