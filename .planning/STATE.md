---
gsd_state_version: 1.0
milestone: v13.1
milestone_name: Global Owner Quality Corpus
status: defining_requirements
last_updated: "2026-06-20T12:00:00Z"
last_activity: 2026-06-20 - Started v13.1 Global Owner Quality Corpus
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v13.1 Global Owner Quality Corpus — owner-only global corpus, human evaluation, feedback generation and evidence-safe quality loop.

**Status:** Defining requirements and roadmap for the new milestone.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-20 - Milestone v13.1 started

Progress: [----------] v13.1 — 0/0 phases complete

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

1. Define v13.1 requirements
2. Create roadmap starting at Phase 157
3. Start with `$gsd-discuss-phase 157` or `$gsd-plan-phase 157`
