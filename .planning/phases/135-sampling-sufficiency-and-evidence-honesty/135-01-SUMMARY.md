---
phase: 135-sampling-sufficiency-and-evidence-honesty
plan: "01"
subsystem: api
tags: [typescript, vitest, human-quality, sampling, evidence-honesty]

requires:
  - phase: 134-live-corpus-operations
    provides: Live corpus operational loop and evaluated rows for report builders
provides:
  - Canonical sampling/thresholds.ts with 5/3/3 gates and TREND_* constants
  - sampling/guidance.ts with computeAdditionalNeeded and gate-specific builders
  - sampleGuidance on calibration, impact, and quality-improvement reports
affects:
  - 135-02-plan (evidenceSource tags and honesty checkers)
  - 135-03-plan (operator coverage API)
  - 136 (trend dashboard consumes TREND_* constants)

tech-stack:
  added: []
  patterns:
    - "Canonical thresholds with backward-compat re-exports at report module boundaries"
    - "Additive sampleGuidance alongside existing insufficientReasons/status labels"
    - "normalizeSamplingStatus maps insufficient_corpus without renaming calibration status"

key-files:
  created:
    - app/src/server/human-quality/sampling/types.ts
    - app/src/server/human-quality/sampling/thresholds.ts
    - app/src/server/human-quality/sampling/guidance.ts
    - app/tests/unit/human-quality/sampling/thresholds.test.ts
    - app/tests/unit/human-quality/sampling/guidance.test.ts
  modified:
    - app/src/server/human-quality/calibration/report.ts
    - app/src/server/human-quality/impact/report.ts
    - app/src/server/human-quality/impact/aggregate.ts
    - app/src/server/human-quality/impact/types.ts
    - app/src/server/human-quality/improvement/reevaluate.ts
    - app/tests/unit/human-quality/calibration/aggregate.test.ts
    - app/tests/unit/human-quality/impact/report.test.ts
    - app/tests/unit/human-quality/improvement/reevaluate.test.ts

key-decisions:
  - "Keep calibration status label insufficient_corpus; map to insufficient_sample only in normalizeSamplingStatus"
  - "Re-export MIN_* constants from report modules so downstream imports remain stable"
  - "sampleGuidance is empty array when status ok; populated additively when insufficient"

patterns-established:
  - "Pattern 1: sampling/thresholds.ts is single source of truth for numeric gates"
  - "Pattern 2: guidance builders read thresholds, never hardcode 5/3 literals"

requirements-completed: [SAMPLE-01, SAMPLE-02]

duration: 8min
completed: 2026-06-17
---

# Phase 135 Plan 01: Canonical Sampling Module and Report Guidance Summary

**Single canonical sampling module with structured sampleGuidance on calibration, impact, and quality-improvement reports — preserving 5/3/3 gates and insufficient_corpus label.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-17T21:23:00Z
- **Completed:** 2026-06-17T21:31:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Created `human-quality/sampling/` with canonical thresholds (5 global / 3 slice-arm) and Phase 136 `TREND_*` constants
- Implemented guidance builders with `computeAdditionalNeeded` and gate-specific `blockedClaim` strings
- Refactored calibration, impact, and quality-improvement reports to import thresholds and emit `sampleGuidance` when below minimum

## Task Commits

Each task was committed atomically (TDD tasks split test/feat):

1. **Task 1: Canonical thresholds and types** - `309677d0` (test), `f545ca28` (feat)
2. **Task 2: Guidance builders with additionalNeeded math** - `c43e5b11` (test), `23deb29f` (feat)
3. **Task 3: Refactor reports to import thresholds and attach sampleGuidance** - `c89da05c` (feat)

**Plan metadata:** pending (docs commit after state update)

## Files Created/Modified

- `app/src/server/human-quality/sampling/types.ts` - SampleGuidance, SampleGate, EvidenceSource types
- `app/src/server/human-quality/sampling/thresholds.ts` - Canonical SAMPLE_* and TREND_* constants with re-exports
- `app/src/server/human-quality/sampling/guidance.ts` - Guidance builders and normalizeSamplingStatus
- `app/src/server/human-quality/calibration/report.ts` - Imports thresholds; adds sampleGuidance
- `app/src/server/human-quality/impact/report.ts` - Imports thresholds; adds sampleGuidance
- `app/src/server/human-quality/improvement/reevaluate.ts` - Imports thresholds; adds per-reason sampleGuidance

## Decisions Made

- Preserved `insufficient_corpus` on calibration reports per Phase 130 evidence checker compatibility
- Guidance derived from same counts used for status resolution (T-135-01 mitigation)
- Backward-compat re-exports at report module boundaries to avoid breaking existing imports

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest `-x` flag not supported in project config; ran tests without bail flag

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SAMPLE-01 and SAMPLE-02 foundation complete for plans 135-02 (evidenceSource tags) and 135-03 (coverage API)
- Phase 136 can consume `TREND_GLOBAL_MIN_EVALUATED`, `TREND_SLICE_MIN`, `TREND_MIN_TIME_BUCKETS`

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/sampling/thresholds.ts
- FOUND: app/src/server/human-quality/sampling/guidance.ts
- FOUND: app/src/server/human-quality/sampling/types.ts
- FOUND: 309677d0, f545ca28, c43e5b11, 23deb29f, c89da05c

---
*Phase: 135-sampling-sufficiency-and-evidence-honesty*
*Completed: 2026-06-17*
