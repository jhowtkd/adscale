---
phase: 135-sampling-sufficiency-and-evidence-honesty
verified: 2026-06-17T21:35:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
---

# Phase 135: Sampling Sufficiency and Evidence Honesty Verification Report

**Phase Goal:** O sistema sabe quando ha amostra suficiente para tendencias e quando deve bloquear conclusoes.
**Verified:** 2026-06-17T21:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Minimum sample thresholds exist for trend, calibration and impact slices (SAMPLE-01) | ✓ VERIFIED | `sampling/thresholds.ts` exports `SAMPLE_GLOBAL_MIN=5`, `SAMPLE_SLICE_MIN=3`, `SAMPLE_ARM_MIN=3`, `TREND_GLOBAL_MIN_EVALUATED`, `TREND_SLICE_MIN`, `TREND_MIN_TIME_BUCKETS=2` |
| 2   | Reports return `insufficient_sample` with next-sample guidance when needed (SAMPLE-02) | ✓ VERIFIED | Impact/quality reports use `insufficient_sample`; calibration retains `insufficient_corpus` alias with `sampleGuidance`; coverage normalizes via `normalizeSamplingStatus()` |
| 3   | Fixture, live-human and accepted-caveat metrics remain separated in evidence (SAMPLE-03) | ✓ VERIFIED | `evidenceSource` tags on run scripts; `evidence-honesty.mjs` validators; child checkers extended; `135-EVIDENCE.template.json` separates gate sources |
| 4   | Operator can see which slices need more samples for the next gate (SAMPLE-04) | ✓ VERIFIED | Coverage tab in `HumanQualityCorpusPanel.tsx`; `GET /api/feedback/sample-coverage`; slice gap table with `additionalNeeded` |
| 5   | All human-quality gates read thresholds from one canonical sampling module | ✓ VERIFIED | `calibration/report.ts`, `impact/report.ts`, `improvement/reevaluate.ts` import from `sampling/thresholds.ts` |
| 6   | Trend sufficiency constants exist for Phase 136 without building trend charts | ✓ VERIFIED | `TREND_*` constants in thresholds; `trend_global` gate in `buildSampleCoverageReport` with deferred-claim note |
| 7   | Calibration, impact and quality-improvement reports expose structured `sampleGuidance` when below minimum | ✓ VERIFIED | `buildCalibrationGuidance`, `buildImpactGuidance`, `buildQualityImprovementGuidance` wired in report builders |
| 8   | Guidance items include `currentCount`, `requiredCount`, `additionalNeeded`, `blockedClaim` | ✓ VERIFIED | `SampleGuidance` interface in `types.ts`; validated by `validateSampleGuidanceEntry` in evidence checkers |
| 9   | Numeric threshold behavior stays 5 global / 3 slice-arm — no value drift | ✓ VERIFIED | Single source in `thresholds.ts`; backward-compat re-exports only; grep shows no duplicate literal thresholds in gate logic |
| 10  | Child evidence checkers reject blended denominators and missing guidance on insufficient reports | ✓ VERIFIED | `BLENDED_FIELD_DENYLIST` in calibration checker; `validateInsufficientSampleGuidance` + `rejectClaimsWhenGuidanceBlocked` in `evidence-honesty.mjs` |
| 11  | Fixture pass rates never appear as live human corpus denominators | ✓ VERIFIED | `fixtureMetrics.evidenceSource: "fixture"` in quality report; checkers enforce `live_human` vs `fixture` separation |
| 12  | Phase 135 evidence template documents sampling honesty contract | ✓ VERIFIED | `135-EVIDENCE.template.json` with per-gate `evidenceSource`, `sampleGuidance`, fixture separation |
| 13  | Coverage report lists calibration, impact and quality-improvement blockers with `additionalNeeded` counts | ✓ VERIFIED | `buildSampleCoverageReport` merges `sliceGaps` sorted by `additionalNeeded` desc |
| 14  | Panel renders guidance from API — no hardcoded threshold prose | ✓ VERIFIED | Coverage tab renders `report.nextOperatorAction` and `gap.additionalNeeded` from API response; component test asserts API-driven text |
| 15  | Coverage API is platform-owner / workspace-admin gated | ✓ VERIFIED | `requireCalibrationAccess` in route; 403 test for unauthorized; workspace scoping test |
| 16  | Empty corpus shows all global gates insufficient with actionable `nextOperatorAction` | ✓ VERIFIED | `coverage.test.ts` asserts empty corpus → all gates `insufficient_sample`, `nextGate=calibration`, actionable operator text |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/src/server/human-quality/sampling/thresholds.ts` | Canonical thresholds | ✓ VERIFIED | 20 lines, exports all constants |
| `app/src/server/human-quality/sampling/guidance.ts` | Guidance builders | ✓ VERIFIED | 154 lines, 3 gate-specific builders |
| `app/src/server/human-quality/sampling/coverage.ts` | Cross-gate rollup | ✓ VERIFIED | 176 lines, exports `buildSampleCoverageReport` |
| `app/src/server/human-quality/sampling/service.ts` | Orchestration | ✓ VERIFIED | Runs 3 report services, builds coverage |
| `app/scripts/check-sampling-sufficiency-evidence.mjs` | Phase 135 evidence gate | ✓ VERIFIED | Validates all 4 SAMPLE requirements |
| `app/scripts/lib/evidence-honesty.mjs` | Shared honesty validators | ✓ VERIFIED | `validateEvidenceSourceTag`, `validateInsufficientSampleGuidance` |
| `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json` | Evidence schema | ✓ VERIFIED | Per-gate source tags and guidance |
| `app/src/app/api/feedback/sample-coverage/route.ts` | Coverage API | ✓ VERIFIED | GET with auth + validation |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Coverage tab UI | ✓ VERIFIED | Coverage tab with gate/slice tables |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `calibration/report.ts` | `sampling/thresholds.ts` | import MIN_GLOBAL_EVALUATED_ITEMS | ✓ WIRED | gsd-tools verified |
| `impact/report.ts` | `sampling/guidance.ts` | buildImpactGuidance | ✓ WIRED | gsd-tools verified |
| `improvement/reevaluate.ts` | `sampling/thresholds.ts` | import MIN_SLICE_SAMPLE | ✓ WIRED | gsd-tools verified |
| `check-score-calibration-evidence.mjs` | `evidence-honesty.mjs` | validateInsufficientSampleGuidance | ✓ WIRED | Delegated via shared lib (gsd-tools pattern miss — manual confirm) |
| `check-real-quality-release-evidence.mjs` | `135-EVIDENCE.template.json` | evidenceSource validation | ✓ WIRED | gsd-tools verified |
| `sample-coverage/route.ts` | `sampling/service.ts` | runSampleCoverage | ✓ WIRED | gsd-tools verified |
| `HumanQualityCorpusPanel.tsx` | `/api/feedback/sample-coverage` | fetchSampleCoverage | ✓ WIRED | gsd-tools verified |
| `coverage.ts` | `guidance.ts` | merge guidance from reports | ✓ WIRED | gsd-tools verified |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `HumanQualityCorpusPanel` Coverage tab | `coverageQuery.data` | `fetchSampleCoverage` → API → `runSampleCoverage` → corpus DB via calibration/impact/quality services | Yes — orchestrates live report runners | ✓ FLOWING |
| `buildSampleCoverageReport` | `sliceGaps` | Merged from child report `sampleGuidance` arrays | Yes — derived from evaluated corpus counts | ✓ FLOWING |
| `buildCalibrationGuidance` | `currentCount` | `evaluatedItemCount` from corpus comparisons | Yes — count-based threshold check | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 135 unit tests | `npm test -- tests/unit/human-quality/sampling/ ...` | 10 files, 122 tests passed | ✓ PASS |
| Sampling evidence checker | `node app/scripts/check-sampling-sufficiency-evidence.mjs --skip-tests` | "Sampling sufficiency evidence check passed." | ✓ PASS |
| Threshold constants | `grep SAMPLE_GLOBAL_MIN thresholds.ts` | Value 5, re-exported as MIN_GLOBAL_EVALUATED_ITEMS | ✓ PASS |
| Coverage module export | `grep buildSampleCoverageReport coverage.ts` | Function exported and used by service | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SAMPLE-01 | 135-01 | Minimum sample thresholds per quality trend, calibration slice and learning-impact slice | ✓ SATISFIED | `sampling/thresholds.ts` with global/slice/arm/trend constants |
| SAMPLE-02 | 135-01 | Reports return `insufficient_sample` with required-next-sample guidance | ✓ SATISFIED | `sampleGuidance` on all reports; checkers enforce non-empty guidance when insufficient |
| SAMPLE-03 | 135-02 | Release evidence distinguishes fixture, live human and accepted caveats | ✓ SATISFIED | `evidenceSource` tags, honesty checkers, evidence template, unit tests |
| SAMPLE-04 | 135-03 | Operator can see which slices need more samples | ✓ SATISFIED | Coverage API + panel tab with gate status and slice gap table |

No orphaned requirements — all four SAMPLE IDs declared in plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `sampling/coverage.ts` | 82 | Hardcoded "at least 5 human evaluations" in `buildNextOperatorAction` | ℹ️ Info | Server-side copy uses literal 5 instead of `SAMPLE_GLOBAL_MIN` template; threshold value matches canonical constant today |

No blockers or stubs found in sampling module.

### Human Verification Required

None — Coverage tab behavior, auth gating, and empty-corpus guidance verified via component tests (`HumanQualityCorpusPanel.test.tsx`), API route tests, and coverage unit tests.

### Gaps Summary

No gaps found. Phase 135 goal achieved:

- Canonical sampling thresholds consolidated with trend constants for Phase 136
- Structured `sampleGuidance` attached to all human-quality reports when below minimum
- Evidence honesty enforced via shared validators and Phase 135 evidence checker
- Operator Coverage view provides cross-gate slice gap visibility with actionable next steps

---

_Verified: 2026-06-17T21:35:00Z_
_Verifier: Claude (gsd-verifier)_
