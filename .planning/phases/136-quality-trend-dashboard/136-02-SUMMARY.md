---
phase: 136-quality-trend-dashboard
plan: "02"
subsystem: api
tags: [human-quality, trend, api, coverage, evidence-cli, vitest]

requires:
  - phase: 136-quality-trend-dashboard
    provides: buildQualityTrendReport, buildTrendGuidance, TREND_* thresholds
provides:
  - runQualityTrend orchestrator with TREND_MAX_ROWS truncation
  - GET /api/feedback/quality-trend with platform-owner auth and dimensional filters
  - Real trend_global gate wired through runSampleCoverage orchestrator
  - run-quality-trend.ts CLI and check-quality-trend-evidence.mjs honesty checker
affects:
  - 136-03-trend-tab-ui
  - 137-operational-gate

tech-stack:
  added: []
  patterns:
    - "Server-side dimensional filters on listEvaluatedCorpusWithEvaluations before aggregation"
    - "Coverage trend field required on BuildSampleCoverageReportInput"
    - "Evidence CLI mirrors run-sample-coverage.ts with TREND-01..04 requirement rollup"

key-files:
  created:
    - app/src/server/human-quality/trend/service.ts
    - app/src/app/api/feedback/quality-trend/route.ts
    - app/src/app/api/feedback/quality-trend/route.test.ts
    - app/scripts/run-quality-trend.ts
    - app/scripts/check-quality-trend-evidence.mjs
    - .planning/phases/136-quality-trend-dashboard/136-EVIDENCE.template.json
    - app/tests/unit/human-quality/trend/service.test.ts
  modified:
    - app/src/server/repositories/human-quality-corpus.ts
    - app/src/server/human-quality/sampling/coverage.ts
    - app/src/server/human-quality/sampling/service.ts
    - app/tests/unit/human-quality/calibration-evaluated-repository.test.ts
    - app/tests/unit/human-quality/sampling/coverage.test.ts

key-decisions:
  - "TREND_MAX_ROWS=500 matches DEFAULT_EVALUATED_CORPUS_LIMIT; truncated when row count hits limit"
  - "trend_global blockedClaims from trend_global and trend_time_buckets guidance only — no Phase 136 placeholder"
  - "runQualityTrend fetched in parallel with calibration/impact/quality in runSampleCoverage"

patterns-established:
  - "Quality trend API follows score-calibration route pattern with requireCalibrationAccess + Zod querySchema"
  - "Evidence checker rejects movement claims when bucket learningImpactStatus is insufficient_sample"

requirements-completed: [TREND-02, TREND-03, TREND-04]

duration: 4min
completed: 2026-06-18
---

# Phase 136 Plan 02: Quality Trend API Summary

**Authenticated GET /api/feedback/quality-trend with server-honest dimensional filters, real trend_global coverage gate, and evidence CLI for Phase 137 audit**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-18T05:04:00Z
- **Completed:** 2026-06-18T05:08:30Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- `runQualityTrend` service fetches filtered corpus rows and builds `QualityTrendReport` with truncated flag at 500 rows
- Repository applies generationMode, format, clientProfileId, primaryFailureReason filters server-side
- `GET /api/feedback/quality-trend` with Zod validation and `requireCalibrationAccess`
- Coverage `trend_global` gate uses real trend status and `buildTrendGuidance` blocked claims
- `run-quality-trend.ts` and `check-quality-trend-evidence.mjs` ready for operational evidence capture

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: Repository dimensional filters and trend service** - `8f3cc8c1` (test), `bf34a196` (feat)
2. **Task 2: Quality trend API route** - `1e30384d` (test), `e9a5dcbe` (feat)
3. **Task 3: Coverage trend_global wire and evidence CLI** - `762fd2ad` (test), `674f3194` (feat)

**Plan metadata:** `0b1b80d2` (docs: complete plan)

## Files Created/Modified

- `app/src/server/human-quality/trend/service.ts` - runQualityTrend orchestrator with TREND_MAX_ROWS
- `app/src/app/api/feedback/quality-trend/route.ts` - Authenticated trend GET endpoint
- `app/src/server/repositories/human-quality-corpus.ts` - Dimensional WHERE filters
- `app/src/server/human-quality/sampling/coverage.ts` - Real trend_global gate from trend input
- `app/src/server/human-quality/sampling/service.ts` - Parallel runQualityTrend in orchestrator
- `app/scripts/run-quality-trend.ts` - Evidence CLI
- `app/scripts/check-quality-trend-evidence.mjs` - Honesty checker with validateEvidenceShape export

## Decisions Made

- TREND_MAX_ROWS=500 aligns with DEFAULT_EVALUATED_CORPUS_LIMIT; truncated signaled when limit hit
- trend_global blockedClaims sourced from trend_global and trend_time_buckets guidance gates
- runQualityTrend runs in Promise.all alongside calibration/impact/quality with shared capturedAt

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- RED `test(136-02)` commits present for all three tasks before corresponding `feat(136-02)` commits
- 42 unit tests pass across trend, coverage, and API route suites

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 136-03: Trend tab UI can consume GET /api/feedback/quality-trend
- Evidence template and checker ready for operator refresh before Phase 137 gate

## Self-Check: PASSED

- FOUND: `.planning/phases/136-quality-trend-dashboard/136-02-SUMMARY.md`
- FOUND: `app/src/app/api/feedback/quality-trend/route.ts`
- FOUND: `app/scripts/run-quality-trend.ts`
- FOUND: commits 8f3cc8c1, bf34a196, 1e30384d, e9a5dcbe, 762fd2ad, 674f3194

---
*Phase: 136-quality-trend-dashboard*
*Completed: 2026-06-18*
