---
phase: 130-score-calibration-and-rubric-alignment
verified: 2026-06-17T11:50:00Z
status: passed
score: 15/15
overrides_applied: 0
---

# Phase 130: Score Calibration and Rubric Alignment Verification Report

**Phase Goal:** O score automatico passa a ser auditavel contra julgamento humano, e divergencias viram ajustes versionados de rubric/gate.

**Verified:** 2026-06-17T11:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each evaluated corpus item compares automatic quality score with human visual score (CALIB-01) | ✓ VERIFIED | `buildComparison` reads `qualitySnapshot.qualityScore` vs `evaluation.visualScore`; `listEvaluatedCorpusWithEvaluations` innerJoins evaluated items |
| 2 | Comparison uses frozen selection-time score — never live re-scoring | ✓ VERIFIED | `compare.ts` only reads snapshot; no `analyzeDerivationCreative` calls; report includes `snapshotCapturedAtNote` |
| 3 | Global rollup loads evaluated items across workspaces with optional cohort filter | ✓ VERIFIED | `listEvaluatedCorpusWithEvaluations({ workspaceId?, cohort? })`; CLI `--all-workspaces` / `--cohort` flags |
| 4 | Calibration report groups divergences by failure reason, mode and format (CALIB-02) | ✓ VERIFIED | `buildCalibrationReport` populates `divergenceByFailureReason`, `divergenceByMode`, `divergenceByFormat` via `groupComparisonsBy` |
| 5 | Report returns `insufficient_corpus` when fewer than 5 evaluated items | ✓ VERIFIED | `MIN_GLOBAL_EVALUATED_ITEMS = 5`; status set in `buildCalibrationReport`; UI shows honest message |
| 6 | `visualMetrics` and `factualMetrics` are separate — never blended (CALIB-04) | ✓ VERIFIED | `CalibrationReport` type has separate top-level keys; tests assert no `overallPass`/`overallQualityPass`; evidence checker rejects blended fields |
| 7 | `highVisualButFactualFail` guard surfaces items where visual scores cannot offset factual failure | ✓ VERIFIED | `highVisualButFactualFail()` in `aggregate.ts`; exposed in `factualMetrics`; shown in UI factual section |
| 8 | Systematic divergence slices (|meanSignedDelta| ≥ 15, n ≥ 3) auto-generate proposed adjustments (CALIB-03) | ✓ VERIFIED | `proposeAdjustments` thresholds in `adjustments.ts`; covered by unit tests |
| 9 | Each adjustment cites corpus item IDs and grouped stats with explicit `adjustmentVersion` | ✓ VERIFIED | `evidenceRefs` with `corpusItemIds`, `sliceStats`, `itemRefs`; `RUBRIC_CALIBRATION_VERSION = "1.0.0"` |
| 10 | Adjustments persist as `proposed` only — no accepted/applied in this phase | ✓ VERIFIED | `insertProposedAdjustment` hardcodes `status: "proposed"`; repository has no accept/supersede mutations |
| 11 | Adjustment targets reference `score_ceiling`, `observable_rubric`, or `gate_classifier` | ✓ VERIFIED | `resolveAdjustmentTarget` in `failure-bridge.ts`; DB check constraint on `target_module` |
| 12 | CLI generates `130-EVIDENCE.json` with global rollup and cohort filter | ✓ VERIFIED | `run-score-calibration.ts` calls `runScoreCalibration` with `--all-workspaces`, `--workspace-id`, `--cohort` |
| 13 | Evidence checker validates schema and visual/factual separation for CI | ✓ VERIFIED | `check-score-calibration-evidence.mjs` passed on template; `score-calibration-evidence` npm script registered |
| 14 | Owner/feedback UI shows read-only calibration tab with MAE, bias, slices, per-item drill-down | ✓ VERIFIED | `HumanQualityCorpusPanel` Calibration tab; tests cover aggregates, drill-down, `insufficient_corpus` |
| 15 | Platform-owner and workspace admin can access calibration report API | ✓ VERIFIED | `requireCalibrationAccess` dual auth; route tests cover platform-owner, workspace admin, 403 for member |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/human-quality/calibration/compare.ts` | Per-item comparison builder | ✓ VERIFIED | Exports `buildComparison`, `buildCalibrationComparisons`, `DIVERGENCE_FLAG_THRESHOLD` |
| `app/src/server/human-quality/calibration/failure-bridge.ts` | Human failure → gate/rubric mapping | ✓ VERIFIED | `resolveGateTargets`, `resolveAdjustmentTarget`, `detectHumanGateMismatch` |
| `app/src/server/repositories/human-quality-corpus.ts` | Evaluated corpus global join | ✓ VERIFIED | `listEvaluatedCorpusWithEvaluations` with Drizzle innerJoin |
| `app/src/server/human-quality/calibration/aggregate.ts` | GroupSlice aggregation + factual guard | ✓ VERIFIED | `aggregateGroup`, `groupComparisonsBy`, `highVisualButFactualFail` |
| `app/src/server/human-quality/calibration/report.ts` | CalibrationReport builder | ✓ VERIFIED | `buildCalibrationReport`, metric separation, min corpus gate |
| `app/drizzle/0044_rubric_calibration_adjustments.sql` | Versioned adjustment registry | ✓ VERIFIED | Table with version, status, target_module, evidence_refs jsonb |
| `app/src/server/human-quality/calibration/adjustments.ts` | Auto-proposal builder | ✓ VERIFIED | `proposeAdjustments` with composite slice grouping |
| `app/src/server/repositories/rubric-calibration-adjustments.ts` | Insert/list proposed adjustments | ✓ VERIFIED | `insertProposedAdjustment`, `listProposedAdjustments`, dedupe lookup |
| `app/src/server/human-quality/calibration/service.ts` | `runScoreCalibration` orchestrator | ✓ VERIFIED | End-to-end: join → compare → report → propose → persist |
| `app/scripts/run-score-calibration.ts` | CLI evidence generation | ✓ VERIFIED | Mirrors Phase 128 evidence flow |
| `app/scripts/check-score-calibration-evidence.mjs` | CI schema validator | ✓ VERIFIED | Validates CALIB-01–04 mapping and metric separation |
| `.planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.template.json` | Evidence schema contract | ✓ VERIFIED | ok + insufficient_corpus examples |
| `app/src/app/api/feedback/score-calibration/route.ts` | GET calibration report API | ✓ VERIFIED | Caps comparisons at 100 with `truncated` flag |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Calibration tab in panel | ✓ VERIFIED | Queue + Calibration tabs; read-only audit surface |
| `app/src/server/auth/calibration-access.ts` | Dual auth helper | ✓ VERIFIED | Platform-owner OR workspace owner/admin |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `human-quality-corpus.ts` | corpus items + evaluations | Drizzle innerJoin, status=evaluated | ✓ WIRED | Manual confirm: `.innerJoin(humanQualityEvaluations, eq(...))` |
| `compare.ts` | `qualitySnapshot.qualityScore` | Frozen snapshot read | ✓ WIRED | gsd-tools pattern match passed |
| `report.ts` | `visualMetrics` + `factualMetrics` | Separate top-level keys | ✓ WIRED | Manual confirm: distinct keys in `CalibrationReport` type |
| `aggregate.ts` | slice keys | `groupComparisonsBy` | ✓ WIRED | Manual confirm: `divergenceByFailureReason/Mode/Format` in report builder |
| `adjustments.ts` | `rubric_calibration_adjustments` | evidenceRefs + status proposed | ✓ WIRED | gsd-tools pattern match passed |
| `service.ts` | full calibration pipeline | compare → report → propose | ✓ WIRED | gsd-tools pattern match passed |
| `run-score-calibration.ts` | `runScoreCalibration` | CLI flags | ✓ WIRED | gsd-tools pattern match passed |
| `HumanQualityCorpusPanel.tsx` | `/api/feedback/score-calibration` | fetch on calibration tab | ✓ WIRED | gsd-tools pattern match passed |
| `check-score-calibration-evidence.mjs` | evidence template | schema + separation | ✓ WIRED | gsd-tools pattern match passed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `HumanQualityCorpusPanel` Calibration tab | `calibrationQuery.data` | `apiFetch(/api/feedback/score-calibration)` | Yes — API calls `runScoreCalibration` → DB join | ✓ FLOWING |
| `score-calibration/route.ts` | `report` | `runScoreCalibration({ workspaceId, cohort })` | Yes — Postgres evaluated corpus + evaluations | ✓ FLOWING |
| `run-score-calibration.ts` | evidence JSON | `runScoreCalibration` + scope metadata | Yes — same service path as API | ✓ FLOWING |
| `buildComparison` | `automaticQualityScore` | `item.qualitySnapshot.qualityScore` | Yes — frozen at corpus selection | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Calibration unit + API + UI tests | `npm test -- tests/unit/human-quality/calibration src/app/api/feedback/score-calibration src/components/feedback/HumanQualityCorpusPanel.test.tsx` | 8 files, 56 tests passed | ✓ PASS |
| Evidence schema validation | `node app/scripts/check-score-calibration-evidence.mjs --evidence 130-EVIDENCE.template.json --skip-tests` | "Score calibration evidence check passed" | ✓ PASS |
| Module exports | `buildComparison`, `buildCalibrationReport`, `runScoreCalibration` | Present and imported by consumers | ✓ PASS |
| Live DB CLI evidence (`status=ok`) | `npx tsx scripts/run-score-calibration.ts --all-workspaces` | Requires DATABASE_URL + ≥5 evaluated items | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CALIB-01 | 130-01, 130-04 | Automatic vs human visual score comparison per evaluated item | ✓ SATISFIED | `compare.ts`, repository join, service, API, CLI, UI tab |
| CALIB-02 | 130-02, 130-04 | Systematic divergences by failure type, mode, format | ✓ SATISFIED | `aggregate.ts` grouping + `report.ts` divergence slices |
| CALIB-03 | 130-03, 130-04 | Versioned gate/rubric adjustments backed by corpus evidence | ✓ SATISFIED | Migration, `adjustments.ts`, repository, `proposeAdjustments` |
| CALIB-04 | 130-02, 130-04 | Factual fidelity separate from visual quality | ✓ SATISFIED | `factualMetrics` bucket, `highVisualButFactualFail`, no blended pass field |

All four requirement IDs declared in plan frontmatter are accounted for. No orphaned CALIB requirements for Phase 130.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None in calibration module | — | — |

No TODO/FIXME/placeholder stubs, empty handlers, or hardcoded empty data flows found in phase artifacts.

### Human Verification Required

None — automated tests cover calibration tab rendering (MAE, bias, slice tables, per-item drill-down, `insufficient_corpus` messaging), API auth matrix, and evidence schema validation. Live DB CLI run depends on corpus volume (environmental, not implementation gap).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Adjustment acceptance/application to gate/rubric source files | Phase 132 | Phase 132 goal: "melhorias de prompt/gate/rubric atacam apenas falhas visuais provadas pelo corpus" |
| 2 | Milestone release gate with reproducible human-quality evidence | Phase 133 | Phase 133 goal: "milestone fecha apenas com evidencia reproduzivel de qualidade humana" |

### Gaps Summary

No implementation gaps found. Phase 130 delivers an auditable calibration pipeline: frozen snapshot comparisons, grouped divergence reporting with factual/visual separation, versioned proposed adjustments with corpus evidence, and operator surfaces (CLI, API, read-only UI tab). Adjustment application intentionally deferred to Phase 132.

---

_Verified: 2026-06-17T11:50:00Z_
_Verifier: Claude (gsd-verifier)_
