---
gsd_state_version: 1.0
milestone: v12.5
milestone_name: Validacao Real de Qualidade e Calibracao do Loop Criativo
status: executing
last_updated: "2026-06-17T13:03:40.717Z"
last_activity: 2026-06-17
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 11
  completed_plans: 9
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.5 — Validacao Real de Qualidade e Calibracao do Loop Criativo.

**Status:** Ready to execute

## Current Position

Phase: 131 — Learning Impact Measurement
Plan: 2 of 04
Status: Ready to execute
Last activity: 2026-06-17

Progress: 2/5 v12.5 phases complete; Phase 131 planned (4 plans, 4 waves).

## Accumulated Context

### v12.5 Direction

- Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- Measure whether v12.4 output-learning recommendation/prefill improves comparable real samples.
- Attack proven visual-quality failures: overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition.

### Phase 129 (complete — 3/3 plans)

- Summaries:
  - `.planning/phases/129-live-human-quality-corpus/129-01-SUMMARY.md`
  - `.planning/phases/129-live-human-quality-corpus/129-02-SUMMARY.md`
  - `.planning/phases/129-live-human-quality-corpus/129-03-SUMMARY.md`

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
- [Phase 129]: Reject forbidden corpus payload keys at repository boundary before persistence
- [Phase 129]: Default invalid cohort to baseline for conservative versioned comparisons
- [Phase 129]: Platform-owner auth on all human-quality corpus API routes
- [Phase 129]: Build quality snapshots from derivation metadata without prompt or outputKey fields
- [Phase 129]: Mount corpus evaluation panel from OwnerAnalyticsPanel; review sheet only enqueues selections
- [Phase 129]: Attach ephemeral previewImageUrl on corpus queue GET without persisting signed URLs
- [Phase 130]: CLI + read-only calibration UI extending HumanQualityCorpusPanel
- [Phase 130]: Auto-propose adjustments at |delta| ≥ 15 with min 3 items per slice; status proposed only
- [Phase 130]: Global multi-workspace rollup report with cohort filter; min 5 items for ok status
- [Phase 130]: JSON evidence in .planning/phases/130-*; platform-owner and workspace admin access
- [Phase 130]: EvaluatedCorpusRow canonical in calibration/types.ts; repository re-exports for join consumers
- [Phase 130]: Default evaluated corpus query limit 500 for calibration payload bounds
- [Phase 130]: Insufficient corpus returns null visual aggregates; factual metrics still computed from available rows
- [Phase 130]: highVisualButFactualFail guard at visual threshold 70 for both human and automatic scores
- [Phase 130-score-calibration-and-rubric-alignment]: Dedupe calibration proposals by slice_key + adjustmentVersion + target_module + target_key
- [Phase 130-score-calibration-and-rubric-alignment]: factual_issue slices target gate_classifier only — no score_ceiling auto-proposals
- [Phase 130]: Panel hides only when both queue and calibration APIs return 403
- [Phase 130]: API caps visual comparisons at 100 with truncated flag for DoS mitigation
- [Phase 131]: Store output-learning attribution on derivations jsonb; legacy null resolves to not_recorded
- [Phase 131]: Batch derivations POST applies identical outputLearningApplication snapshot to every job
- [Phase 131]: Edit-before-generate from output-learning card does not set application snapshot — only accept path
- [Phase 131]: sanitizeOutputLearningApplication runs at corpus freeze when derivation has stored application
- [Phase 131]: resolveLearningApplied returns true only when snapshot.applied===true

### Phase 130 (complete — 4/4 plans)

- Context: `.planning/phases/130-score-calibration-and-rubric-alignment/130-CONTEXT.md`
- Research: `.planning/phases/130-score-calibration-and-rubric-alignment/130-RESEARCH.md`
- Validation: `.planning/phases/130-score-calibration-and-rubric-alignment/130-VALIDATION.md`
- Plans:
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-01-PLAN.md` — corpus join + per-item comparison
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-02-PLAN.md` — grouped divergence + factual separation
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-03-PLAN.md` — adjustment proposal registry
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-04-PLAN.md` — CLI evidence + API + UI tab

### Phase 131 (planned — 0/4 plans)

- Research: `.planning/phases/131-learning-impact-measurement/131-RESEARCH.md`
- Validation: `.planning/phases/131-learning-impact-measurement/131-VALIDATION.md`
- Plans:
  - `.planning/phases/131-learning-impact-measurement/131-01-PLAN.md` — application snapshot schema and API persistence (IMPACT-01)
  - `.planning/phases/131-learning-impact-measurement/131-02-PLAN.md` — accept flow threading, corpus freeze, enrich helpers (IMPACT-01)
  - `.planning/phases/131-learning-impact-measurement/131-03-PLAN.md` — impact report engine with slice comparison and honesty gates (IMPACT-02–04)
  - `.planning/phases/131-learning-impact-measurement/131-04-PLAN.md` — evidence CLI, impact API, read-only Impact UI tab (IMPACT-01–04)

## Next Steps

Execute: `/gsd-execute-phase 131`
