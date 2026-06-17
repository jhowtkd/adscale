---
gsd_state_version: 1.0
milestone: v12.5
milestone_name: Validacao Real de Qualidade e Calibracao do Loop Criativo
status: planning
last_updated: "2026-06-17T18:00:00.000Z"
last_activity: 2026-06-17
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 19
  completed_plans: 15
  percent: 79
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.5 — Validacao Real de Qualidade e Calibracao do Loop Criativo.

**Status:** Phase 133 planned — ready to execute

## Current Position

Phase: 133 — Real Quality Release Gate
Plan: 0/4 planned
Status: Planned
Last activity: 2026-06-17

Progress: Phase 133 planned (4 plans, 4 waves); Phases 129–132 complete (15/19 v12.5 plans, 79%).

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
- [Phase 131]: Slice key clientProfileId|generationMode|format; cohort does not determine learningApplied arm
- [Phase 131]: LearningImpactReport nulls movement deltas when status insufficient_sample; intent/factual remain descriptive
- [Phase 131]: Evidence CLI + checker mirror Phase 130 calibration pattern with insufficient_sample honesty gates
- [Phase 132]: Panel hides only when queue, calibration, impact, and quality APIs all return 403
- [Phase 132]: Store bounded changeSpec as jsonb on rubric_calibration_adjustments row
- [Phase 132]: Bump RUBRIC_CALIBRATION_VERSION to 1.1.0 signaling Phase 132 apply tranche
- [Phase 132]: Applied only accepted visual_overload ceiling (-5) at v1.1.0; gate taxonomy unchanged without gate_classifier accepts
- [Phase 132]: Corpus archetypes weak_hierarchy, illegible_cta, unfocused_composition added for deterministic re-eval arm
- [Phase 132]: Default quality-improvement-evidence npm script uses --skip-tests; vitest subset runs when flag omitted
- [Phase 132]: Phase 133 gate uses --run-regression for full v12.3/v12.4 script regression against live evidence
- [Phase 132]: MIN_SLICE_SAMPLE per targeted reason in both arms required before quality improvement status ok
- [Phase 132]: improvementDeployedAt defaults to earliest acceptedAt among accepted adjustments
- [Phase 132]: Panel hides only when queue, calibration, impact, and quality APIs all return 403

### Phase 132 (complete — 4/4 plans)

- Summaries:
  - `.planning/phases/132-targeted-creative-quality-improvements/132-01-SUMMARY.md`
  - `.planning/phases/132-targeted-creative-quality-improvements/132-02-SUMMARY.md`
  - `.planning/phases/132-targeted-creative-quality-improvements/132-03-SUMMARY.md`
  - `.planning/phases/132-targeted-creative-quality-improvements/132-04-SUMMARY.md`
- Research: `.planning/phases/132-targeted-creative-quality-improvements/132-RESEARCH.md`
- Validation: `.planning/phases/132-targeted-creative-quality-improvements/132-VALIDATION.md`
- Plans:
  - `.planning/phases/132-targeted-creative-quality-improvements/132-01-PLAN.md` — accept lifecycle + apply contracts + RUBRIC_CALIBRATION_VERSION 1.1.0 (QUALITY-02)
  - `.planning/phases/132-targeted-creative-quality-improvements/132-02-PLAN.md` — evidence-bound ceiling/rubric/gate edits + archetype fixtures (QUALITY-01, QUALITY-02)
  - `.planning/phases/132-targeted-creative-quality-improvements/132-03-PLAN.md` — v12.3/v12.4 regression guard wiring (QUALITY-03)
  - `.planning/phases/132-targeted-creative-quality-improvements/132-04-PLAN.md` — re-evaluation report + CLI + API + Quality tab (QUALITY-04)
- Operator must accept ≥1 visual calibration proposal before module edits (checkpoint 02-00)
- Re-evaluation uses post_learning cohort for after-arm; insufficient_sample when afterCount=0

### Phase 130 (complete — 4/4 plans)

- Context: `.planning/phases/130-score-calibration-and-rubric-alignment/130-CONTEXT.md`
- Research: `.planning/phases/130-score-calibration-and-rubric-alignment/130-RESEARCH.md`
- Validation: `.planning/phases/130-score-calibration-and-rubric-alignment/130-VALIDATION.md`
- Plans:
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-01-PLAN.md` — corpus join + per-item comparison
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-02-PLAN.md` — grouped divergence + factual separation
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-03-PLAN.md` — adjustment proposal registry
  - `.planning/phases/130-score-calibration-and-rubric-alignment/130-04-PLAN.md` — CLI evidence + API + UI tab

### Phase 131 (complete — 4/4 plans, human approved 2026-06-17)

- Research: `.planning/phases/131-learning-impact-measurement/131-RESEARCH.md`
- Validation: `.planning/phases/131-learning-impact-measurement/131-VALIDATION.md`
- Verification: `.planning/phases/131-learning-impact-measurement/131-VERIFICATION.md` (passed, human_approved 2026-06-17)
- Plans:
  - `.planning/phases/131-learning-impact-measurement/131-01-PLAN.md` — application snapshot schema and API persistence (IMPACT-01)
  - `.planning/phases/131-learning-impact-measurement/131-02-PLAN.md` — accept flow threading, corpus freeze, enrich helpers (IMPACT-01)
  - `.planning/phases/131-learning-impact-measurement/131-03-PLAN.md` — impact report engine with slice comparison and honesty gates (IMPACT-02–04)
  - `.planning/phases/131-learning-impact-measurement/131-04-PLAN.md` — evidence CLI, impact API, read-only Impact UI tab (IMPACT-01–04)

- [Phase 132]: MIN_SLICE_SAMPLE per targeted reason in both arms required before quality improvement status ok
- [Phase 132]: improvementDeployedAt defaults to earliest acceptedAt among accepted adjustments
- [Phase 132]: Fixture before-arm pass rate uses baselineVerdict snapshot on targeted archetypes
- [Phase 132]: QUALITY-04 checker rejects non-null deltas when insufficient_sample

### Phase 133 (planned — 0/4 plans)

- Research: `.planning/phases/133-real-quality-release-gate/133-RESEARCH.md`
- Validation: `.planning/phases/133-real-quality-release-gate/133-VALIDATION.md`
- Plans:
  - `.planning/phases/133-real-quality-release-gate/133-01-PLAN.md` — milestone evidence schema + QA-23/24 checker
  - `.planning/phases/133-real-quality-release-gate/133-02-PLAN.md` — QA-22 real-quality-release-gate orchestrator
  - `.planning/phases/133-real-quality-release-gate/133-03-PLAN.md` — evidence aggregation + --run-regression / --factual-only
  - `.planning/phases/133-real-quality-release-gate/133-04-PLAN.md` — v12.5 milestone audit + ROADMAP/STATE closure

## Next Steps

Execute Phase 133: `/gsd-execute-phase 133`
