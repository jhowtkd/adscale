---
gsd_state_version: 1.0
milestone: v11.5
milestone_name: milestone
status: Ready for execution
stopped_at: Phase 59 planned (4 plans, 3 waves)
last_updated: "2026-06-05T17:14:23.964Z"
last_activity: 2026-06-05
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# State: ADScale

## Current Position

Milestone: v11.5 — Qualidade IA Orientada por Feedback
Phase: 59
Plan: 59-01 (not started)
Status: Ready for execution
Last activity: 2026-06-05

**Last session:** 2026-06-05
**Stopped At:** Phase 59 context gathered (feedback-informed regeneration)
**Resume File:** None

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
- Phase 58 context: `.planning/phases/58-scoring-and-qa-alignment/58-CONTEXT.md`
- Phase 58 research: `.planning/phases/58-scoring-and-qa-alignment/58-RESEARCH.md`
- Phase 58 plans: `58-01-PLAN.md` (taxonomy + normalization) and `58-02-PLAN.md` (gate + i18n/UI)
- Phase 59 context: `.planning/phases/59-feedback-informed-regeneration/59-CONTEXT.md`
- Phase 59 plans: `59-01-PLAN.md` (brief builder), `59-02-PLAN.md` (route/persistence), `59-03-PLAN.md` (pre-confirm UI), `59-04-PLAN.md` (tests)
- AI quality primitives already exist: prompt contracts, creative score, creative QA, hard quality gate, regeneration suggestions, and beta feedback reports.

## Key Decisions

- Feedback capture is authenticated-only inside ADScale_2.
- Diagnostics sanitized server-side; screenshots/replay disabled by default.
- Owner notes and resolution summaries are private to platform owners.
- v11.5 should improve generation quality through contract, QA/scoring, and regeneration loops rather than changing provider/model first.
- Persist creative contract and prompt provenance as JSONB on derivations via workspace-scoped repository helper.
- Resolve source package and asset IDs before buildDerivationPrompt; approved_derivation uses source descriptor not baseAssetId.
- Phase 58: shared quality taxonomy module; score/QA normalization (no default-70 on malformed output); inherited CTA hard failures; score-issue promotion to gate; PT-BR/EN blocking vs polish copy.
- Phase 59: unified regeneration correction-brief builder; feedback as categorized context only; pre-confirm primary reason UI; persist brief on child derivations; inherit parent creative contract on regenerate.

## Next Steps

1. Execute Phase 59: `/gsd-execute-phase 59` starting with `59-01-PLAN.md`.
2. Keep v11.5 focused on contract, score/QA, regeneration and fixtures.
3. Keep deploy ops from v11.4 separate unless it directly blocks quality work.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Execute Phase 59 feedback-informed regeneration (4 plans, 3 waves).
