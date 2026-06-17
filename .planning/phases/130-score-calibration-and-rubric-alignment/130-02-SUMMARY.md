---
phase: 130-score-calibration-and-rubric-alignment
plan: "02"
subsystem: api
tags: [calibration, vitest, typescript, human-quality]

requires:
  - phase: 130-01
    provides: CalibrationComparison per-item join from evaluated corpus
provides:
  - GroupSlice aggregation with divergence grouping by failure reason, mode and format
  - Factual metrics bucket with highVisualButFactualFail guard list
  - CalibrationReport builder with ok/insufficient_corpus status and metric separation
affects:
  - 130-03 adjustment proposal registry
  - 130-04 CLI evidence and calibration UI tab

tech-stack:
  added: []
  patterns:
    - "Phase 128 visualMetrics/factualMetrics bucket separation mirrored in CalibrationReport"
    - "Pure TS reducers for MAE and grouped divergence slices"
    - "MIN_GLOBAL_EVALUATED_ITEMS=5 honesty gate before status ok"

key-files:
  created:
    - app/src/server/human-quality/calibration/aggregate.ts
    - app/src/server/human-quality/calibration/report.ts
    - app/tests/unit/human-quality/calibration/aggregate.test.ts
  modified: []

key-decisions:
  - "Insufficient corpus returns null visual aggregates but still computes factual metrics from available rows"
  - "highVisualButFactualFail uses visualThreshold 70 for both human and automatic scores"
  - "adjustments array present but empty until plan 130-03"

patterns-established:
  - "GroupSlice reducer with null means for empty slices (not zero)"
  - "buildCompositeSliceKey(reason|mode|format) for adjustment slice targeting"

requirements-completed: [CALIB-02, CALIB-04]

duration: 3min
completed: 2026-06-17
---

# Phase 130 Plan 02: Grouped Divergence Report and Factual Metric Separation Summary

**Grouped divergence aggregation and CalibrationReport schema with strict visual/factual metric separation and insufficient_corpus honesty gate**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-17T11:30:00Z
- **Completed:** 2026-06-17T11:32:37Z
- **Tasks:** 3
- **Files modified:** 3 created

## Accomplishments

- `aggregateGroup` and `groupComparisonsBy` slice divergences by failure reason, generation mode and format with MAE, signed bias and over/under counts
- `buildFactualMetrics` and `highVisualButFactualFail` enforce CALIB-04 separation — no blended pass metric
- `buildCalibrationReport` assembles full report with `ok` / `insufficient_corpus` status at `MIN_GLOBAL_EVALUATED_ITEMS = 5`

## Task Commits

Each task was committed atomically (TDD RED + GREEN per task):

1. **Task 1: Grouped divergence aggregation** — `6232a1bf` (test), `3bc5073d` (feat)
2. **Task 2: Factual bucket and guard list** — `0bd7ce48` (test), `6d2c2204` (feat)
3. **Task 3: CalibrationReport builder with corpus minimum** — `c1e30ab9` (test), `d9380b6a` (feat)

**Plan metadata:** pending (docs commit)

## Files Created/Modified

- `app/src/server/human-quality/calibration/aggregate.ts` — GroupSlice aggregation, factual metrics, composite slice keys
- `app/src/server/human-quality/calibration/report.ts` — CalibrationReport builder and corpus minimum constants
- `app/tests/unit/human-quality/calibration/aggregate.test.ts` — 15 unit tests covering CALIB-02 and CALIB-04 behaviors

## Decisions Made

- Insufficient corpus suppresses visual aggregate fabrication (null means, empty divergence maps) while retaining comparisons array for drill-down
- Factual pass rate computed from all provided comparisons regardless of corpus status — visual calibration claims gated separately
- `snapshotCapturedAtNote` documents frozen snapshot comparison contract per Phase 130 research

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 130-03 can consume `buildCompositeSliceKey`, `MIN_SLICE_SAMPLE`, and empty `adjustments` slot in `CalibrationReport`
- Plan 130-04 can wire `buildCalibrationReport` to repository join and evidence JSON output

---
*Phase: 130-score-calibration-and-rubric-alignment*
*Completed: 2026-06-17*

## Self-Check: PASSED

- All key files exist on disk
- All task commits verified via `git log --oneline -6`
