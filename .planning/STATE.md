---
gsd_state_version: 1.0
milestone: v12.5
milestone_name: Validacao Real de Qualidade e Calibracao do Loop Criativo
status: defining requirements
last_updated: "2026-06-17T07:55:00.000Z"
last_activity: 2026-06-17
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.5 — Validacao Real de Qualidade e Calibracao do Loop Criativo.

**Status:** v12.5 initialized; ready to discuss Phase 129.

## Current Position

Phase: 129 — Live Human Quality Corpus
Plan: —
Status: Not started
Last activity: 2026-06-17 — v12.5 milestone initialized after v12.4 archive

Progress: 0/5 phases complete; 19/19 requirements mapped to roadmap.

## Accumulated Context

### v12.5 Direction

- Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- Measure whether v12.4 output-learning recommendation/prefill improves comparable real samples.
- Attack proven visual-quality failures: overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition.

### From v12.4

- `output_decision_events` captures canonical human output evidence.
- `client_output_learnings` stores approved/superseded output learnings in Postgres.
- `/api/campaigns/[id]/output-recommendation` applies bounded pre-generation recommendation/prefill.
- `guardOutputLearningPrefill` and `filterApprovedPostgresLearnings` preserve factual and authorization boundaries.
- `qualityImprovementPathRate=1.0` and `safetyGuardPassRate=1.0` passed in fixture release gate.

### From v12.3

- Accepted visual-quality gap remains: `meanQualityScore 70.17 < 75`.
- Factual fidelity baseline must remain 1.0 in any new release gate.

## Decisions

- [v12.5]: Focus on real human quality validation before adding new product features.
- [v12.5]: Treat fixture-based v12.4 evidence as necessary but not sufficient for quality claims.
- [v12.5]: Keep factual metrics separate from visual quality and learning-impact metrics.
- [v12.5]: Start with Phase 129 Live Human Quality Corpus.

## Next Steps

Run `$gsd-discuss-phase 129` to clarify corpus shape, reviewer workflow, data model and validation strategy.
