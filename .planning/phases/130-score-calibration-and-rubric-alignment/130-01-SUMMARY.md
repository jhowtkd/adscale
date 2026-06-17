---
phase: 130-score-calibration-and-rubric-alignment
plan: "01"
subsystem: api
tags: [calibration, human-quality, drizzle, vitest, postgres]

requires:
  - phase: 129-live-human-quality-corpus
    provides: corpus schema, evaluations, qualitySnapshot contract
provides:
  - Per-item CalibrationComparison from frozen qualitySnapshot vs human visualScore
  - Human failure reason to gate/rubric target bridge
  - listEvaluatedCorpusWithEvaluations global join query with optional filters
affects:
  - 130-02 grouped divergence aggregation
  - 130-03 adjustment proposal registry
  - 130-04 CLI evidence and calibration UI tab

tech-stack:
  added: []
  patterns:
    - "Frozen snapshot comparison — no live re-scoring at calibration time"
    - "Evaluated-only innerJoin repository query with optional workspace/cohort filters"
    - "Explicit human-to-gate taxonomy bridge with factual bucket separation"

key-files:
  created:
    - app/src/server/human-quality/calibration/types.ts
    - app/src/server/human-quality/calibration/compare.ts
    - app/src/server/human-quality/calibration/failure-bridge.ts
    - app/tests/unit/human-quality/calibration/compare.test.ts
    - app/tests/unit/human-quality/calibration/failure-bridge.test.ts
    - app/tests/unit/human-quality/calibration-evaluated-repository.test.ts
  modified:
    - app/src/server/repositories/human-quality-corpus.ts

key-decisions:
  - "Re-export EvaluatedCorpusRow from repository while canonical type lives in calibration/types.ts"
  - "Default evaluated corpus query limit 500 to mitigate unbounded calibration payloads (T-130-01)"

patterns-established:
  - "Pattern 1: buildComparison reads qualitySnapshot.qualityScore only — never live derivation re-score"
  - "Pattern 3: resolveGateTargets maps human reasons to gate/rubric keys; factual_issue uses FIDELITY_HARD_FAILURE_CODES only"

requirements-completed: [CALIB-01]

duration: 8min
completed: 2026-06-17
---

# Phase 130 Plan 01: Evaluated Corpus Join and Per-Item Score Comparison Summary

**Frozen snapshot auto-vs-human score comparison with global evaluated corpus join and human-to-gate failure bridge (CALIB-01 foundation)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-17T08:27:00Z
- **Completed:** 2026-06-17T08:35:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Pure `buildComparison` / `buildCalibrationComparisons` diff selection-time `qualitySnapshot.qualityScore` against human `visualScore` with `DIVERGENCE_FLAG_THRESHOLD = 15`
- `resolveGateTargets` and `detectHumanGateMismatch` bridge Phase 129 human taxonomy to gate/rubric targets without conflating factual and visual buckets
- `listEvaluatedCorpusWithEvaluations` inner-joins evaluated corpus items with evaluations for global multi-workspace rollup (optional workspace/cohort filters)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define calibration comparison contracts** - `b2eb9bb8` (feat)
2. **Task 2: Add human-to-gate failure bridge** - `47d0168c` (feat)
3. **Task 3: Repository join for evaluated corpus globally** - `9ab86be7` (feat)

## Files Created/Modified

- `app/src/server/human-quality/calibration/types.ts` - CalibrationComparison and EvaluatedCorpusRow types
- `app/src/server/human-quality/calibration/compare.ts` - Per-item comparison builders using frozen snapshot
- `app/src/server/human-quality/calibration/failure-bridge.ts` - Human reason to gate target mapping
- `app/src/server/repositories/human-quality-corpus.ts` - listEvaluatedCorpusWithEvaluations join query
- `app/tests/unit/human-quality/calibration/*.test.ts` - Unit coverage for compare and failure-bridge
- `app/tests/unit/human-quality/calibration-evaluated-repository.test.ts` - Mocked repository join tests

## Decisions Made

- Canonical `EvaluatedCorpusRow` type in `calibration/types.ts`; repository re-exports for downstream consumers
- Default limit 500 on evaluated corpus queries to address T-130-01 unbounded payload risk

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 130-02 can consume `buildCalibrationComparisons` and `listEvaluatedCorpusWithEvaluations` for grouped divergence and factual metric separation
- `resolveGateTargets` ready for adjustment proposal target resolution in 130-03

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/calibration/compare.ts
- FOUND: app/src/server/human-quality/calibration/failure-bridge.ts
- FOUND: app/src/server/repositories/human-quality-corpus.ts (listEvaluatedCorpusWithEvaluations)
- FOUND: b2eb9bb8
- FOUND: 47d0168c
- FOUND: 9ab86be7

---
*Phase: 130-score-calibration-and-rubric-alignment*
*Completed: 2026-06-17*
