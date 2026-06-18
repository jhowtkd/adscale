---
phase: 136-quality-trend-dashboard
plan: "01"
subsystem: api
tags: [human-quality, trend, iso-week, sampling, vitest]

requires:
  - phase: 135-sampling-sufficiency-and-evidence-honesty
    provides: TREND_* thresholds, SampleGuidance contracts, evidence honesty patterns
provides:
  - Pure trend aggregation module (bucket, aggregate, report, types)
  - buildTrendGuidance for trend_global and trend_time_buckets gates
  - ISO-week bucketing by evaluation.createdAt
  - Independent regression/stale/insufficient alert flags
  - Bounded per-bucket evidence refs (100-item cap)
affects:
  - 136-02-quality-trend-api
  - 136-03-trend-tab-ui

tech-stack:
  added: []
  patterns:
    - "UTC ISO-week bucketing without date-fns"
    - "buildImpactRow reuse for per-bucket learning arm counts"
    - "Three independent TrendAlertFlags booleans with optional per-flag reasons"

key-files:
  created:
    - app/src/server/human-quality/trend/types.ts
    - app/src/server/human-quality/trend/bucket.ts
    - app/src/server/human-quality/trend/aggregate.ts
    - app/src/server/human-quality/trend/report.ts
    - app/tests/unit/human-quality/trend/bucket.test.ts
    - app/tests/unit/human-quality/trend/aggregate.test.ts
    - app/tests/unit/human-quality/trend/report.test.ts
  modified:
    - app/src/server/human-quality/sampling/guidance.ts
    - app/src/server/human-quality/sampling/types.ts

key-decisions:
  - "Regression compares the last two chronologically populated buckets; both must meet TREND_SLICE_MIN"
  - "Stale evidence when latestEvaluatedAt > capturedAt (ISO string compare)"
  - "buildTrendGuidance blockedClaim is quality trend direction (replaces Phase 135 placeholder prose)"

patterns-established:
  - "Trend engine is pure in-memory over EvaluatedCorpusRow — no API or fixture mixing"
  - "Evidence refs sorted by evaluatedAt desc, capped at EVIDENCE_CAP=100 per bucket"

requirements-completed: [TREND-01, TREND-03, TREND-04]

duration: 4min
completed: 2026-06-18
---

# Phase 136 Plan 01: Trend Engine Summary

**ISO-week trend engine with honest sampling gates, independent alert flags, and 100-item evidence refs over live human evaluations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-18T04:58:00Z
- **Completed:** 2026-06-18T05:02:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- `human-quality/trend/` module: types, UTC ISO-week bucketing, per-bucket metrics, report orchestration
- `computeBucketMetrics` reuses `buildImpactRow` for learning-impact arm sufficiency per bucket
- `buildQualityTrendReport` gates status on `TREND_GLOBAL_MIN_EVALUATED` + `TREND_MIN_TIME_BUCKETS`, exposes three independent alert flags, caps evidence at 100 items
- `buildTrendGuidance` exported with `trend_global` and `trend_time_buckets` gates for 136-02 coverage wiring

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: Trend types and ISO-week bucketing** - `cab58bcc` (test), `785a569a` (feat)
2. **Task 2: Per-bucket metrics and regression detection** - `443e2532` (test), `cb1fbcc3` (feat)
3. **Task 3: Trend report builder, guidance and evidence caps** - `09507984` (test), `23786c6f` (feat)

**Plan metadata:** `115d20cf` (docs: complete plan)

## Files Created/Modified

- `app/src/server/human-quality/trend/types.ts` - QualityTrendReport, TrendBucket, TrendAlertFlags contracts
- `app/src/server/human-quality/trend/bucket.ts` - bucketKeyForDate, groupEvaluatedRowsByBucket
- `app/src/server/human-quality/trend/aggregate.ts` - computeBucketMetrics, detectRegression
- `app/src/server/human-quality/trend/report.ts` - buildQualityTrendReport orchestrator
- `app/src/server/human-quality/sampling/guidance.ts` - buildTrendGuidance
- `app/src/server/human-quality/sampling/types.ts` - trend_time_buckets gate union
- `app/tests/unit/human-quality/trend/*.test.ts` - 26 unit tests

## Decisions Made

- Regression detection uses the last two chronologically populated buckets; regression is withheld when either bucket is below `TREND_SLICE_MIN`
- Stale evidence flagged when `latestEvaluatedAt > capturedAt` (lexicographic ISO compare)
- Per-bucket learning impact status is `ok` only when learned and non-learned arms each have ≥ `TREND_SLICE_MIN` items

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Regression pair selection semantics**
- **Found during:** Task 2 (detectRegression implementation)
- **Issue:** Initial implementation compared last two sufficient buckets (skipping intermediate insufficient weeks), conflicting with test expecting false when the immediate prior week is below slice min
- **Fix:** Compare last two populated buckets chronologically; return false when either is below `TREND_SLICE_MIN`; adjusted empty-bucket test fixture so last two populated are both sufficient
- **Files modified:** `aggregate.ts`, `aggregate.test.ts`
- **Verification:** `npm test -- tests/unit/human-quality/trend/aggregate.test.ts` — 10 passed
- **Committed in:** `cb1fbcc3`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Clarifies TREND-03 regression semantics; no scope change.

## TDD Gate Compliance

- RED `test(136-01)` commits present for all three tasks before corresponding `feat(136-01)` commits
- All 26 trend unit tests pass

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 136-02: wire `buildQualityTrendReport` into API route, repository filters, coverage gate, evidence CLI
- `buildTrendGuidance` ready for `coverage.ts` consumption

## Self-Check: PASSED

- FOUND: `.planning/phases/136-quality-trend-dashboard/136-01-SUMMARY.md`
- FOUND: `app/src/server/human-quality/trend/report.ts`
- FOUND: commits cab58bcc, 785a569a, 443e2532, cb1fbcc3, 09507984, 23786c6f

---
*Phase: 136-quality-trend-dashboard*
*Completed: 2026-06-18*
