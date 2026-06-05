---
gsd_state_version: 1.0
milestone: v11.5
milestone_name: Qualidade IA Orientada por Feedback
status: roadmap_created
last_updated: "2026-06-05T00:00:00.000Z"
last_activity: 2026-06-05
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 0
  percent: 0
---

# State: ADScale

## Current Position

Milestone: v11.5 — Qualidade IA Orientada por Feedback
Phase: 57 ready for planning
Plan: —
Status: Roadmap created — ready to plan phase 57
Last activity: 2026-06-05 — Milestone v11.5 roadmap created

## Accumulated Context

- Marketing lives in `jhowtkd/site-adscale.git`; app stays in ADScale_2.
- Beta feedback: `/feedback` triage for platform owners (`PLATFORM_OWNER_EMAILS`).
- Feedback handoff: `.planning/phases/56-verification-and-privacy-audit/56-HANDOFF.md`
- Migrations: `app/drizzle/0025_beta_entitlements.sql` then `app/drizzle/0026_feedback_reports.sql` (split to avoid idx-25 collision on DBs that already applied beta entitlements).
- AI quality primitives already exist: prompt contracts, creative score, creative QA, hard quality gate, regeneration suggestions, and beta feedback reports.

## Key Decisions

- Feedback capture is authenticated-only inside ADScale_2.
- Diagnostics sanitized server-side; screenshots/replay disabled by default.
- Owner notes and resolution summaries are private to platform owners.
- v11.5 should improve generation quality through contract, QA/scoring, and regeneration loops rather than changing provider/model first.

## Next Steps

1. Plan phase 57: Creative Contract and Prompt Provenance.
2. Keep v11.5 focused on contract, score/QA, regeneration and fixtures.
3. Keep deploy ops from v11.4 separate unless it directly blocks quality work.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Plan phase 57: Creative Contract and Prompt Provenance.
