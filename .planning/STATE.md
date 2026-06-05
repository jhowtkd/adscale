---
gsd_state_version: 1.0
milestone: v11.6
milestone_name: Creative Strategy Cockpit
status: planned
stopped_at: Milestone v11.6 initialized — ready for phase planning
last_updated: "2026-06-05T19:00:00.000Z"
last_activity: 2026-06-05
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: ADScale

## Current Position

Milestone: v11.6 — Creative Strategy Cockpit
Phase: Not started (next: Phase 61)
Plan: —
Status: Roadmap created
Last activity: 2026-06-05

**Last session:** 2026-06-05
**Stopped At:** Milestone v11.6 initialized — ready for `$gsd-plan-phase 61`
**Resume File:** None

## Accumulated Context

- Marketing lives in `jhowtkd/site-adscale.git`; app stays in ADScale_2.
- Beta feedback: `/feedback` triage for platform owners (`PLATFORM_OWNER_EMAILS`).
- v11.5 archives: `.planning/milestones/v11.5-ROADMAP.md`, `v11.5-REQUIREMENTS.md`, `v11.5-MILESTONE-AUDIT.md`, `v11.5-phases/`.
- Migration `app/drizzle/0027_fine_morlun.sql` (journal idx 27) adds `creative_contract`, `prompt_provenance`, and `regeneration_correction_brief` — apply via `npm run db:migrate` in deployed environments.
- Quality loop: contract → prompt → score → gate → brief → regenerate → child; 28 fixture regression tests pass without OpenAI.
- v11.6 shifts quality left: readiness score and guided briefing should happen before credit-heavy generation.
- Existing modules to reuse: `preflight-analysis`, `creative-diagnosis`, brand kit, creative contract, quality taxonomy, preview derivations, share links, delivery package.

## Key Decisions

- v11.5 improves generation quality through contract, QA/scoring, and regeneration loops rather than changing provider/model first.
- Persist creative contract and prompt provenance as JSONB on derivations.
- Shared quality taxonomy; score/QA normalization without silent defaults on malformed output.
- Regeneration correction briefs merge gate/score/QA/feedback-category inputs; feedback cannot override hard contract fields.
- Synthetic fixtures for known failure modes; no real customer assets in committed tests.
- Build the cockpit as orchestration of existing primitives first; avoid provider/model churn.
- Preview-first generation should make credit spend explicit before full batch.

## v11.6 Roadmap Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 61 | Creative Readiness Foundation | READY-01..05 | Planned |
| 62 | Guided Briefing Cockpit | GUIDE-01..05 | Planned |
| 63 | Strategy Recipes and Preview Gate | RECIPE-01..05, PREVIEW-01..04 | Planned |
| 64 | Client Approval Package | DELIVER-01..04 | Planned |
| 65 | Verification, Analytics, and Handoff | CQA-01..03 | Planned |

## Next Steps

1. Run `$gsd-plan-phase 61` to plan Creative Readiness Foundation.
2. Keep deployment/migration readiness in mind: production must already be on `v11.5.1` or later before relying on v11.5 JSONB fields.
3. Preserve existing untracked `.planning/phases/62-production-deploy-and-smoke-verification/` unless the owner decides to archive or merge it separately.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-05)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v11.6 Creative Strategy Cockpit.
