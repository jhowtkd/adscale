---
gsd_state_version: 1.0
milestone: v13.1
milestone_name: Global Owner Quality Corpus
status: passed_with_tech_debt
last_updated: "2026-06-21T00:50:00Z"
last_activity: 2026-06-21 - CAPTURE-04 closed; audit passed_with_tech_debt
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v13.1 Global Owner Quality Corpus — owner-only global corpus, human evaluation, feedback generation and evidence-safe quality loop.

**Status:** v13.1 passed_with_tech_debt — pending git commit for durable closure.

## Current Position

Phase: 161 - Global Evidence and Release Gate (complete)
Plan: 2/2 complete
Status: Complete
Last activity: 2026-06-20 - Completed Phase 161

Progress: [##########] v13.1 — 5/5 phases complete

Resume file: .planning/milestones/v13.0-ROADMAP.md (Phase 158 context from ROADMAP)

## Accumulated Context

### v13.0 Shipped With Tech Debt

- `calibration_signals` + `calibration_rules` tables and brand-taste module
- Cenbrap recorder dual-writes calibration signals on confirm
- Brand taste profiles, rule extraction, prompt-builder integration
- Uncertainty queue classifier and claims matrix release gate
- Remaining evidence debt: 5 Jhonatan decisions pending, fixture-only corpus, agreement/customer-real claims blocked

### v13.1 Starting Point

- Existing `/feedback` owner surface already hosts owner analytics, beta sessions and `HumanQualityCorpusPanel`
- Existing `human_quality_corpus_items` and `human_quality_evaluations` are workspace-scoped
- Existing corpus GET/evaluation flows require `workspaceId` from the client, which is not enough for a global owner queue
- Preview attachment currently assumes all corpus items belong to the first item's workspace
- Global learning claims must remain blocked until sample size and source composition are sufficient

## Decisions

- [v13.1]: Use platform-owner access for global corpus, not workspace admin access
- [v13.1]: Resolve workspace context server-side from corpus item during evaluation
- [v13.1]: Treat every generated creative as a candidate stream, but keep reviewed corpus as a prioritized queue
- [v13.1]: Keep prompts, storage keys and raw sensitive payloads out of global review artifacts

## Next Steps

1. Verify `npm run build` passes after outputKey fix
2. Implement candidate list GET + owner promote UI (CAPTURE-04) or formally defer
3. Commit v13.1 changes when operator approves
