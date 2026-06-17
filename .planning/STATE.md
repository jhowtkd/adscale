---
gsd_state_version: 1.0
milestone: v12.5
milestone_name: Validacao Real de Qualidade e Calibracao do Loop Criativo
status: plan_ready
last_updated: "2026-06-17T08:30:00.000Z"
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

**Status:** Phase 129 plan ready.

## Current Position

Phase: 129 — Live Human Quality Corpus
Plan: 129-01, 129-02, 129-03
Status: Planned
Last activity: 2026-06-17 — Phase 129 context and implementation plan captured

Progress: 0/5 phases complete; 19/19 requirements mapped to roadmap.

## Accumulated Context

### v12.5 Direction

- Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- Measure whether v12.4 output-learning recommendation/prefill improves comparable real samples.
- Attack proven visual-quality failures: overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition.

### Phase 129 (plan ready)

- Context file: `.planning/phases/129-live-human-quality-corpus/129-CONTEXT.md`
- Research file: `.planning/phases/129-live-human-quality-corpus/129-RESEARCH.md`
- Validation file: `.planning/phases/129-live-human-quality-corpus/129-VALIDATION.md`
- Plans:
  - `.planning/phases/129-live-human-quality-corpus/129-01-PLAN.md` — canonical corpus contract, schema and repository.
  - `.planning/phases/129-live-human-quality-corpus/129-02-PLAN.md` — internal corpus API and queue service.
  - `.planning/phases/129-live-human-quality-corpus/129-03-PLAN.md` — owner evaluation UI and verification.
- Corpus inclusion is explicit/manual, not automatic.
- Evaluation happens in an owner/feedback/internal queue, one item at a time.
- First reviewer role is admin/technical, not workspace members or external reviewers.
- Human form: visual score 0-100, factual pass/fail, approve/reject/regenerate intent, closed primary visible failure reason plus other.

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

Run `$gsd-execute-phase 129` to implement the Live Human Quality Corpus plans.
