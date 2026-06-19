---
gsd_state_version: 1.0
milestone: v12.7
milestone_name: "Olhar ADScale: Direcao de Arte Antes de Compliance"
status: planning
last_updated: "2026-06-19T11:45:00.498Z"
last_activity: 2026-06-19 - Completed Phase 139 Plan 01 dual-verdict contracts and persistence
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-19)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** v12.7 Olhar ADScale. Replace the creative advisor's UI/UX checklist bias with art-direction judgment before export compliance.

**Status:** Ready to plan

## Current Position

Phase: 139 - Dual Verdict and Export Validator (in progress)
Plan: 139-01 complete; 139-02 ready
Status: Dual-verdict contracts, persistence, and approvability gate shipped in 139-01
Last activity: 2026-06-19 - Completed Phase 139 Plan 01 dual-verdict contracts and persistence

Progress: [███░░░░░░░] v12.7 — 2/5 phases; 3/10 plans complete; next 139-02 export validator

## Accumulated Context

### v12.7 Direction

- ADScale should scale creative criterion, not just generate variations or enforce export compliance.
- Creative judgment must happen in two passes: `Olhar` (figure, gestalt, voice, invite) and `Exportacao` (brand, CTA, claims, format, required text, resolution).
- Production campaign audits exposed the core failure: outputs can be invalid, approved, generic or UI-like while the existing advisor still speaks in CTA/button/module/checklist language.
- The first client voice is Cenbrap. Voice is an overlay on the global Olhar ADScale constitution, not a full multi-tenant voice management product.
- v12.7 must keep v12.5/v12.6 evidence honesty: no quality claim from empty corpus, insufficient sample or automated green alone.

### v12.5 Direction

- Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- Measure whether v12.4 output-learning recommendation/prefill improves comparable real samples.
- Attack proven visual-quality failures: overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition.

### v12.6 Direction

- Turn the v12.5 quality infrastructure into a live operating loop.
- Populate and evaluate real corpus rows from actual campaigns before claiming quality movement.
- Separate operational evidence from technical green checks.
- Add sampling and sufficiency rules so small datasets produce `insufficient_sample`, not optimistic claims.
- Surface live quality, factuality and learning-impact trends for owner decisions.

### Phase 134 (complete — 4/4 plans)

- Context: `.planning/phases/134-live-corpus-operations/134-CONTEXT.md`
- Research: `.planning/phases/134-live-corpus-operations/134-RESEARCH.md`
- Validation: `.planning/phases/134-live-corpus-operations/134-VALIDATION.md`
- Verification: `.planning/phases/134-live-corpus-operations/134-VERIFICATION.md` (passed automated 2026-06-17; operator data pending; LIVEQUAL-02 gap closed in 134-04)
- Summaries:
  - `.planning/phases/134-live-corpus-operations/134-01-SUMMARY.md`
  - `.planning/phases/134-live-corpus-operations/134-02-SUMMARY.md`
  - `.planning/phases/134-live-corpus-operations/134-03-SUMMARY.md`
  - `.planning/phases/134-live-corpus-operations/134-04-SUMMARY.md`
- Plans:
  - `.planning/phases/134-live-corpus-operations/134-01-PLAN.md` — batch selection and queue progress contracts (LIVEQUAL-01, LIVEQUAL-02, LIVEQUAL-04) ✅
  - `.planning/phases/134-live-corpus-operations/134-02-PLAN.md` — operator review UX and fast evaluation loop (LIVEQUAL-02, LIVEQUAL-03, LIVEQUAL-04) ✅
  - `.planning/phases/134-live-corpus-operations/134-03-PLAN.md` — phase verification and operator handoff (LIVEQUAL-01..04) ✅
  - `.planning/phases/134-live-corpus-operations/134-04-PLAN.md` — campaign-dimensional queue progress gap closure (LIVEQUAL-02) ✅

### Phase 137 (complete — 4/4 plans)

- Goal: Operational quality release gate with dual technical/operational status (QALIVE-01..04)
- Depends on: Phases 134-136 live ops, sampling honesty, trend dashboard
- Research: `.planning/phases/137-operational-quality-release-gate/137-RESEARCH.md`
- Validation: `.planning/phases/137-operational-quality-release-gate/137-VALIDATION.md`
- Verification: `.planning/phases/137-operational-quality-release-gate/137-VERIFICATION.md` (passed 2026-06-18)
- Milestone audit: `.planning/milestones/v12.6-MILESTONE-AUDIT.md`
- Summaries:
  - `.planning/phases/137-operational-quality-release-gate/137-01-SUMMARY.md` ✅
  - `.planning/phases/137-operational-quality-release-gate/137-02-SUMMARY.md` ✅
  - `.planning/phases/137-operational-quality-release-gate/137-03-SUMMARY.md` ✅
  - `.planning/phases/137-operational-quality-release-gate/137-04-SUMMARY.md` ✅
- Plans:
  - `.planning/phases/137-operational-quality-release-gate/137-01-PLAN.md` — operational evidence schema + QALIVE-02/03 checker ✅
  - `.planning/phases/137-operational-quality-release-gate/137-02-PLAN.md` — dual-block release gate orchestrator (QALIVE-01, QALIVE-02) ✅
  - `.planning/phases/137-operational-quality-release-gate/137-03-PLAN.md` — live aggregation + --run-regression + CLI registration (QALIVE-01, QALIVE-03) ✅
  - `.planning/phases/137-operational-quality-release-gate/137-04-PLAN.md` — v12.6 milestone audit + ROADMAP/STATE closure (QALIVE-04) ✅

### Phase 136 (complete — 3/3 plans)

- Goal: Owner tracks live quality over time and decides where to intervene (TREND-01..04)
- Depends on: Phase 135 sampling thresholds, coverage API, evidence honesty
- Research: `.planning/phases/136-quality-trend-dashboard/136-RESEARCH.md`
- Validation: `.planning/phases/136-quality-trend-dashboard/136-VALIDATION.md`
- Verification: `.planning/phases/136-quality-trend-dashboard/136-VERIFICATION.md` (passed, human_approved 2026-06-17)
- Summaries:
  - `.planning/phases/136-quality-trend-dashboard/136-01-SUMMARY.md` ✅
  - `.planning/phases/136-quality-trend-dashboard/136-02-SUMMARY.md` ✅
  - `.planning/phases/136-quality-trend-dashboard/136-03-SUMMARY.md` ✅
- Plans:
  - `.planning/phases/136-quality-trend-dashboard/136-01-PLAN.md` — trend engine: ISO-week bucketing, metrics, alert flags, evidence refs (TREND-01, TREND-03, TREND-04) ✅
  - `.planning/phases/136-quality-trend-dashboard/136-02-PLAN.md` — quality trend API, repository filters, coverage gate wire, evidence CLI (TREND-02, TREND-03, TREND-04) ✅
  - `.planning/phases/136-quality-trend-dashboard/136-03-PLAN.md` — Trend tab UI: LineChart, filters, alert chips, drilldown (TREND-01..04) ✅

### Phase 135 (complete — 3/3 plans)

- Goal: Sampling sufficiency thresholds and honest `insufficient_sample` states (SAMPLE-01..04)
- Depends on: Phase 134 live corpus operational loop
- Research: `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-RESEARCH.md`
- Validation: `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-VALIDATION.md`
- Summaries:
  - `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-01-SUMMARY.md` ✅
  - `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-02-SUMMARY.md` ✅
  - `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-03-SUMMARY.md` ✅
- Plans:
  - `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-01-PLAN.md` — canonical sampling module + sampleGuidance (SAMPLE-01, SAMPLE-02) ✅
  - `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-02-PLAN.md` — evidenceSource tags + honesty checkers (SAMPLE-03) ✅
  - `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-03-PLAN.md` — operator coverage API + panel (SAMPLE-04) ✅

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
- [Phase 133]: QA-24 primary metric is meanHumanVisualScore; fixture 70.17 is reference baseline only
- [Phase 133]: accepted_gap caveat requires acceptedAt, rationale, acceptedBy and shrunk gap vs 70.17 prior baseline
- [Phase 133]: QA-22 orchestrator runs 14 sequential steps; sub-checkers use --skip-tests; --run-regression deferred to 133-03
- [Phase 133]: 131 evidence aggregation falls back to 131-EVIDENCE.template.json when JSON absent
- [Phase 133]: Milestone full regression: cd app && npm run real-quality-release-gate -- --run-regression after --aggregate
- [Phase 133]: QA-24 Path B accepted_gap visual_quality_gap (currentValue 72, gapToTarget 3 < prior 4.83) — live human corpus refresh deferred operator action
- [Phase 133]: v12.5 milestone audit at .planning/milestones/v12.5-MILESTONE-AUDIT.md; shipped 2026-06-17
- [Phase 133]: QA-24 Path B accepted_gap visual_quality_gap (gap 3 < prior 4.83); live corpus refresh deferred
- [Phase 133]: v12.5 milestone shipped 2026-06-17 with real-quality-release-gate --run-regression pass
- [Phase 134]: MAX_CORPUS_BATCH_SIZE=25 for conservative operator batch selection cap
- [Phase 134]: Batch POST returns 200 with per-item results; single POST keeps 201 item response
- [Phase 134]: GET includeProgress=true opt-in for queue progress without default query cost
- [Phase 134]: Queue panel always fetches includeProgress=true for operator totals without extra round trip
- [Phase 134]: Automated verification green; real operator sample execution is data-dependent — deferred to operator action before Phase 135 sampling claims
- [Phase 134]: Phase 135 is next for sampling sufficiency; do not mark SAMPLE/TREND/QALIVE complete in Phase 134
- [Phase 134]: Automated verification green; real operator sample execution is data-dependent
- [Phase 134]: Phase 135 is next for sampling sufficiency; do not mark SAMPLE/TREND/QALIVE complete in Phase 134
- [Phase 134]: byCampaign queue progress uses campaignId UUID slice keys without campaigns table join
- [Phase 134]: QueueProgressSummary uses lg:grid-cols-2 for four breakdown tables including By campaign
- [Phase 135]: Canonical sampling thresholds in human-quality/sampling/thresholds.ts; reports re-export MIN_* for backward compat
- [Phase 135]: sampleGuidance additive on insufficient reports; calibration keeps insufficient_corpus label
- [Phase 135]: TREND_* constants defined for Phase 136; no trend chart UI in 135-01
- [Phase 135]: evidenceSource short tags (live_human, fixture) in evidence JSON per 135-RESEARCH Pattern 3
- [Phase 135]: Shared honesty validators in app/scripts/lib/evidence-honesty.mjs for checker and vitest reuse
- [Phase 135]: Dedicated Coverage tab on HumanQualityCorpusPanel for cross-gate slice gaps (SAMPLE-04)
- [Phase 135]: Panel hides when queue, calibration, impact, quality and coverage APIs all return 403
- [Phase 135]: trend_global coverage gate placeholder only; trend charts deferred to Phase 136
- [Phase 136-quality-trend-dashboard]: trend_global uses real runQualityTrend status via coverage orchestrator (136-02)
- [Phase 136-quality-trend-dashboard]: Regression compares last two populated ISO weeks; both must meet TREND_SLICE_MIN
- [Phase 136-quality-trend-dashboard]: buildTrendGuidance uses trend_global and trend_time_buckets gates with blockedClaim quality trend direction
- [Phase 136-quality-trend-dashboard]: TREND_MAX_ROWS=500 matches DEFAULT_EVALUATED_CORPUS_LIMIT; truncated when row count hits limit
- [Phase 136-quality-trend-dashboard]: trend_global blockedClaims from trend guidance gates; Phase 135 placeholder removed
- [Phase 136-quality-trend-dashboard]: runQualityTrend fetched in parallel with calibration/impact/quality in runSampleCoverage
- [Phase 136]: Trend tab owns full filter row; sixth 403 gate includes quality-trend API
- [Phase 136]: Chart bucket selection via dropdown and LineChart activeLabel click
- [Phase 137]: Exported BLENDED_FIELD_DENYLIST from Phase 133 checker for operational evidence validation
- [Phase 137]: 137 template uses tech_debt root status when technical pass coexists with operational insufficient_sample
- [Phase 137]: QALIVE-03 blocks qualityImprovementClaimed when factual pass not 1.0 or sampleGuidance additionalNeeded > 0
- [Phase 137]: Inlined Phase 133 TECHNICAL_STEPS in operational gate orchestrator to avoid nested exit-code confusion
- [Phase 137]: resolveMilestoneStatus encodes QALIVE-02: technical fail exit 1; operational insufficient_sample exit 0 with tech_debt root status
- [Phase 137]: aggregateOperationalEvidence derives technicalRegression from 133 metrics not stale 137 fail state
- [Phase 137]: runRegressionMode updates technicalRegression only; qualityImprovementClaimed defaults false
- [Phase 137]: v12.6 milestone audit at .planning/milestones/v12.6-MILESTONE-AUDIT.md; shipped 2026-06-18
- [Phase 137]: QALIVE-03 blocks improvement claims not milestone closure; tech_debt when operational insufficient_sample
- [Phase 137]: DATABASE_URL unavailable at audit — template 135/136 fallbacks; operator must refresh live corpus before stronger claims
- [Phase 137]: DATABASE_URL unavailable at audit — template 135/136 fallbacks; operator must refresh live corpus
- [Phase 137]: QALIVE-03 blocks improvement claims not milestone closure; tech_debt when operational insufficient_sample
- [Phase 137]: v12.6 milestone shipped 2026-06-18 with operational-quality-release-gate --run-regression pass
- [Phase 138]: Inject Olhar section before legacy integrity rules; keep factual preservation active
- [Phase 138]: READING_PATH_GESTALT_BUDGET replaces THREE_ZONE_VISUAL_BUDGET in art_variation mode rules
- [Phase 138]: check-olhar-vocabulary.mjs scans core prompt/rubric files with regex-line allowlist
- [Phase 138]: Cenbrap voice uses principles only — no fixed layout prescription in prompt section
- [Phase 138]: Art-direction mapping returns null for export-only failures; confusa wins over sem_opiniao
- [Phase 138]: Voice review artifact defaults to pending_review until Jhonatan approves for Phase 140
- [Phase 139]: buildOlharVerdictFromFailures returns null for export-only failures; never infers pronta/quase
- [Phase 139]: Dual verdict rejection payloads include olharVerdict/exportStatus only when normalized
- [Phase 139-01]: Typed dual-verdict contracts, nullable jsonb persistence, dual-verdict-aware assertDerivationApprovable

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

### Phase 133 (complete — 4/4 plans)

- Summaries:
  - `.planning/phases/133-real-quality-release-gate/133-01-SUMMARY.md`
  - `.planning/phases/133-real-quality-release-gate/133-02-SUMMARY.md`
  - `.planning/phases/133-real-quality-release-gate/133-03-SUMMARY.md`
  - `.planning/phases/133-real-quality-release-gate/133-04-SUMMARY.md`
- Research: `.planning/phases/133-real-quality-release-gate/133-RESEARCH.md`
- Validation: `.planning/phases/133-real-quality-release-gate/133-VALIDATION.md`
- Verification: `.planning/phases/133-real-quality-release-gate/133-VERIFICATION.md` (passed 2026-06-17)
- Milestone audit: `.planning/milestones/v12.5-MILESTONE-AUDIT.md`
- Plans:
  - `.planning/phases/133-real-quality-release-gate/133-01-PLAN.md` — milestone evidence schema + QA-23/24 checker
  - `.planning/phases/133-real-quality-release-gate/133-02-PLAN.md` — QA-22 real-quality-release-gate orchestrator
  - `.planning/phases/133-real-quality-release-gate/133-03-PLAN.md` — evidence aggregation + --run-regression / --factual-only
  - `.planning/phases/133-real-quality-release-gate/133-04-PLAN.md` — v12.5 milestone audit + ROADMAP/STATE closure

## Next Steps

Execute Phase 139 Plan 02 (`139-02-PLAN.md`) for deterministic export validation. Review Cenbrap voice in `138-VOICE-REVIEW.md` before Phase 140 prompt injection. Keep v12.6 operator debt visible: populate live human corpus (at least 5 evaluations), set `DATABASE_URL`, rerun refresh CLIs and `operational-quality-release-gate -- --run-regression` before making live quality claims.
