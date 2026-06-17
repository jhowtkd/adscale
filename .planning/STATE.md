---
gsd_state_version: 1.0
milestone: v12.4
milestone_name: Aprendizado de Qualidade dos Outputs
status: completed
last_updated: "2026-06-17T00:45:00.000Z"
last_activity: 2026-06-16
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 12
  completed_plans: 7
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-16)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Phase 128 — Evaluation and Release Gate.

**Status:** Phase 127 complete; ready for Phase 128

## Current Position

Phase: 128 — Evaluation and Release Gate
Plan: —
Status: Ready for discuss/plan
Last activity: 2026-06-16

Progress: Phase 127 shipped — safety guards and appliedLearningTrace on output recommendations

## Accumulated Context

### Phase 127 (shipped 2026-06-16)

- `guardOutputLearningPrefill` blocks factual-contract conflicts (restyling/format, readiness caps)
- `filterApprovedPostgresLearnings` — Mem0 relevance never authorizes prefill (SAFE-02)
- `appliedLearningTrace` on recommendation API with evidence event IDs and blocked fields
- avoid_pattern entries in trace always `applied: false`

### Phase 126 (shipped 2026-06-16)

- `getOutputLearningRecommendation` ranks approved output learnings into prefill packet
- API: `GET /api/campaigns/[id]/output-recommendation`
- Bounded prefill: cta, generation_mode, format, style_policy only
- `avoid_pattern` hints informational only — no prompt prose mutation
- UI card at `#mission-output-learnings` above derive action bar (before credits)

### Phase 125 (shipped 2026-06-16)

- `client_output_learnings` aggregates `output_decision_events` into scoped canonical learnings
- Bounded variable keys: cta, generation_mode, format, style_policy, avoid_pattern
- Learning identity scoped by workspace/client/mode/format; empty string for unscoped
- Mem0 projects only approved learnings (`memoryType: output_learning`); Postgres is source of truth
- Best-effort recompute after evidence capture + dedicated POST recompute API

### Phase 124 (shipped 2026-06-16)

- `output_decision_events` is the canonical append-only evidence store
- Recorder is best-effort and never blocks primary user actions

### From v12.3 (shipped 2026-06-16)

- Factual integrity contracts must not be overridden by output learnings (deferred enforcement to Phase 127)

## Session Continuity

Last activity: 2026-06-16 — Phase 127 executed autonomously (plans 01–03)

## Decisions

- [Phase 125]: Learning identity includes scope_generation_mode and scope_format
- [Phase 125]: avoid_pattern uses negative/corrective events as supporting evidence
- [Phase 125]: Strength-weighted confidence (strong=1.0, medium=0.6, weak=0.3)
- [Phase 124]: Canonical evidence in `output_decision_events`; not beta_analytics or memory tables
- [Phase 125]: Learning identity scoped by workspace/client/mode/format with empty-string sentinel
- [Phase 125]: Mem0 projects only approved output learnings (memoryType output_learning)
- [Phase 126]: avoid_pattern surfaced as hints only — never in prefill or prompt
- [Phase 126]: Primary prefill from prefer-direction bounded keys with scope filtering
- [Phase 127]: Postgres-approved filter before ranking — Mem0 relevance never authorizes prefill
- [Phase 127]: Prefill guards block restyling/format conflicts and cap aggressive creative on identity-sensitive modes
- [Phase 127]: appliedLearningTrace on API payload with evidence event IDs for audit

## Next Steps

Proceed to Phase 128: evaluation and release gate for v12.4 milestone.
