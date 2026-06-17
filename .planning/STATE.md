---
gsd_state_version: 1.0
milestone: v12.4
milestone_name: Aprendizado de Qualidade dos Outputs
status: completed
last_updated: "2026-06-17T00:37:01.371Z"
last_activity: 2026-06-16
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 9
  completed_plans: 3
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-16)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Phase 127 — Safety, Boundaries, and Explainability.

**Status:** Phase 126 complete; ready for Phase 127

## Current Position

Phase: 127 — Safety, Boundaries, and Explainability
Plan: —
Status: Ready for discuss/plan
Last activity: 2026-06-16

Progress: Phase 126 shipped — output learning recommendations with bounded prefill before generation

## Accumulated Context

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

Last activity: 2026-06-16 — Phase 126 executed autonomously (plans 01–03)

## Decisions

- [Phase 125]: Learning identity includes scope_generation_mode and scope_format
- [Phase 125]: avoid_pattern uses negative/corrective events as supporting evidence
- [Phase 125]: Strength-weighted confidence (strong=1.0, medium=0.6, weak=0.3)
- [Phase 124]: Canonical evidence in `output_decision_events`; not beta_analytics or memory tables
- [Phase 125]: Learning identity scoped by workspace/client/mode/format with empty-string sentinel
- [Phase 125]: Mem0 projects only approved output learnings (memoryType output_learning)
- [Phase 126]: avoid_pattern surfaced as hints only — never in prefill or prompt
- [Phase 126]: Primary prefill from prefer-direction bounded keys with scope filtering

## Next Steps

Proceed to Phase 127: safety guards and explainability for applied output learnings.
