---
gsd_state_version: 1.0
milestone: v11.5
milestone_name: milestone
status: executing
last_updated: "2026-06-05T16:29:00.000Z"
last_activity: 2026-06-05 — Completed 57-01 plan
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 50
  current_plan: "02"
  total_plans_in_phase: 2
---

# State: ADScale

## Current Position

Milestone: v11.5 — Qualidade IA Orientada por Feedback
Phase: 57 — Creative Contract and Prompt Provenance (in progress)
Plan: 1 of 2 complete — next: 57-02 prompt contract regression coverage
Status: Executing phase 57
Last activity: 2026-06-05 — Completed 57-01-PLAN.md

## Accumulated Context

- Marketing lives in `jhowtkd/site-adscale.git`; app stays in ADScale_2.
- Beta feedback: `/feedback` triage for platform owners (`PLATFORM_OWNER_EMAILS`).
- Feedback handoff: `.planning/phases/56-verification-and-privacy-audit/56-HANDOFF.md`
- Phase 57 context: `.planning/phases/57-creative-contract-and-prompt-provenance/57-CONTEXT.md`
- Phase 57 research: `.planning/phases/57-creative-contract-and-prompt-provenance/57-RESEARCH.md`
- Phase 57 validation: `.planning/phases/57-creative-contract-and-prompt-provenance/57-VALIDATION.md`
- Phase 57 plans: `57-01-PLAN.md` (persist contract/provenance) and `57-02-PLAN.md` (prompt contract regression coverage).
- Migrations: through `app/drizzle/0027_creative_contract_provenance.sql` (creative_contract + prompt_provenance JSONB on derivations).
- Phase 57-01 summary: `.planning/phases/57-creative-contract-and-prompt-provenance/57-01-SUMMARY.md`
- AI quality primitives already exist: prompt contracts, creative score, creative QA, hard quality gate, regeneration suggestions, and beta feedback reports.

## Key Decisions

- Feedback capture is authenticated-only inside ADScale_2.
- Diagnostics sanitized server-side; screenshots/replay disabled by default.
- Owner notes and resolution summaries are private to platform owners.
- v11.5 should improve generation quality through contract, QA/scoring, and regeneration loops rather than changing provider/model first.
- Persist creative contract and prompt provenance as JSONB on derivations via workspace-scoped repository helper.
- Resolve source package and asset IDs before buildDerivationPrompt; approved_derivation uses source descriptor not baseAssetId.

## Next Steps

1. Execute plan 57-02 (prompt contract regression coverage).
2. Keep v11.5 focused on contract, score/QA, regeneration and fixtures.
3. Keep deploy ops from v11.4 separate unless it directly blocks quality work.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Execute plan 57-02 from `.planning/phases/57-creative-contract-and-prompt-provenance/57-02-PLAN.md`.
