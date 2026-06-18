---
phase: 135-sampling-sufficiency-and-evidence-honesty
plan: "03"
subsystem: api
tags: [typescript, vitest, human-quality, sampling, coverage, react-query]

requires:
  - phase: 135-sampling-sufficiency-and-evidence-honesty
    plan: "01"
    provides: SampleGuidance types, guidance builders, sampleGuidance on reports
provides:
  - buildSampleCoverageReport cross-gate rollup in sampling/coverage.ts
  - runSampleCoverage orchestrating calibration, impact and quality runners
  - GET /api/feedback/sample-coverage with platform-owner auth
  - Coverage tab on HumanQualityCorpusPanel with slice gap table
  - run-sample-coverage.ts evidence CLI for Phase 135
affects:
  - 136 (trend dashboard; trend_global gate placeholder only)
  - 137 (release gate audit may consume coverage evidence)

tech-stack:
  added: []
  patterns:
    - "Cross-gate coverage merges sampleGuidance sorted by additionalNeeded descending"
    - "nextGate priority calibration → impact → quality_improvement → release"
    - "Panel insufficient messaging driven by API sampleGuidance with prose fallback"

key-files:
  created:
    - app/src/server/human-quality/sampling/coverage.ts
    - app/src/server/human-quality/sampling/service.ts
    - app/scripts/run-sample-coverage.ts
    - app/src/app/api/feedback/sample-coverage/route.ts
    - app/tests/unit/human-quality/sampling/coverage.test.ts
    - app/src/app/api/feedback/sample-coverage/route.test.ts
  modified:
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx

key-decisions:
  - "Dedicated Coverage tab (not Queue summary card) per research Pattern 4"
  - "trend_global gate placeholder with Phase 136 deferral note; no trend charts in 135"
  - "evaluatedItemCount sourced from calibration report for cross-tab consistency"
  - "Panel hides only when all five APIs (queue, calibration, impact, quality, coverage) return 403"

patterns-established:
  - "SampleGuidanceList component renders API guidance; fallback prose when array empty"
  - "Coverage evidence CLI documents SAMPLE-01..04 pass/pending from gate statuses"

requirements-completed: [SAMPLE-04]

duration: 12min
completed: 2026-06-17
---

# Phase 135 Plan 03: Operator Coverage API and Panel Summary

**Cross-gate sample coverage rollup with GET /api/feedback/sample-coverage, evidence CLI, and Coverage tab showing slice gaps from API sampleGuidance instead of hardcoded thresholds.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-17T21:27:00Z
- **Completed:** 2026-06-17T21:30:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- `buildSampleCoverageReport` merges calibration, impact and quality `sampleGuidance` with gate status normalization and `nextOperatorAction`
- `runSampleCoverage` reuses existing report runners with workspace/cohort filters and row caps
- Platform-owner gated `GET /api/feedback/sample-coverage` returns `{ report }` JSON
- HumanQualityCorpusPanel Coverage tab shows gate table, slice gaps, and `nextOperatorAction`
- Calibration, Impact and Quality tabs render `sampleGuidance` lists; Quality tab shows `evidenceSource: fixture` when `fixtureMetrics` present

## Task Commits

Each task was committed atomically:

1. **Task 1: Cross-gate coverage rollup service** - `df98884c` (feat)
2. **Task 2: Coverage API with platform-owner auth** - `df58018b` (feat)
3. **Task 3: Coverage tab and guidance-driven insufficient UI** - `c9f74dbd` (feat)

**Plan metadata:** `4a57e455` (docs: complete plan)

## Files Created/Modified

- `app/src/server/human-quality/sampling/coverage.ts` - Cross-gate rollup builder with gates, sliceGaps, nextGate
- `app/src/server/human-quality/sampling/service.ts` - `runSampleCoverage` orchestrator
- `app/scripts/run-sample-coverage.ts` - Evidence CLI writing 135-EVIDENCE.json
- `app/src/app/api/feedback/sample-coverage/route.ts` - Authenticated coverage GET endpoint
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - Coverage tab + SampleGuidanceList
- `app/tests/unit/human-quality/sampling/coverage.test.ts` - Coverage builder unit tests
- `app/src/app/api/feedback/sample-coverage/route.test.ts` - API auth/validation tests
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` - Coverage tab and guidance UI tests

## Decisions Made

- Dedicated Coverage tab matches research recommendation for operator slice-gap visibility
- `trend_global` gate included as snapshot placeholder; charts deferred to Phase 136
- `evaluatedItemCount` taken from calibration report to align with Calibration tab corpus count

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Tasks 1 and 2 were marked `tdd="true"` but test and implementation landed in single feat commits per task (no separate `test(...)` RED commits). All specified tests pass.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SAMPLE-04 operator coverage view complete; Phase 135 plan 02 (SAMPLE-03 evidence checkers) may proceed independently
- Phase 136 can consume `trend_global` gate and `TREND_*` thresholds for trend charts

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/sampling/coverage.ts
- FOUND: app/src/server/human-quality/sampling/service.ts
- FOUND: app/scripts/run-sample-coverage.ts
- FOUND: app/src/app/api/feedback/sample-coverage/route.ts
- FOUND: .planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-03-SUMMARY.md
- FOUND: df98884c
- FOUND: df58018b
- FOUND: c9f74dbd

---
*Phase: 135-sampling-sufficiency-and-evidence-honesty*
*Completed: 2026-06-17*
