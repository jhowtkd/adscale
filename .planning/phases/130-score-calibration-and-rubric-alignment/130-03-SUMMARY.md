---
phase: 130-score-calibration-and-rubric-alignment
plan: "03"
subsystem: database
tags: [calibration, postgres, drizzle, vitest, human-quality]

requires:
  - phase: 130-02
    provides: CalibrationReport builder and composite slice aggregation
provides:
  - Versioned rubric_calibration_adjustments Postgres registry with corpus evidence refs
  - proposeAdjustments auto-proposal from divergence slices at |delta| ≥ 15 and n ≥ 3
  - runScoreCalibration orchestrator with deduped proposal persistence
affects:
  - 130-04 CLI evidence and calibration API/UI tab

tech-stack:
  added: []
  patterns:
    - "Proposed-only adjustment lifecycle — no accepted/applied status in Phase 130"
    - "Evidence refs mirror output-learning corpusItemId + bounded stats pattern"
    - "resolveAdjustmentTarget maps human failure reasons to score_ceiling, observable_rubric, or gate_classifier"

key-files:
  created:
    - app/drizzle/0044_rubric_calibration_adjustments.sql
    - app/src/server/repositories/rubric-calibration-adjustments.ts
    - app/src/server/human-quality/calibration/adjustments.ts
    - app/src/server/human-quality/calibration/service.ts
    - app/tests/unit/human-quality/calibration-adjustments-repository.test.ts
    - app/tests/unit/human-quality/calibration/adjustments.test.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/human-quality/calibration/types.ts
    - app/src/server/human-quality/calibration/failure-bridge.ts

key-decisions:
  - "Dedupe proposals by slice_key + adjustmentVersion + target_module + target_key unique index"
  - "factual_issue slices target gate_classifier only — no score_ceiling auto-proposals"
  - "Rationale cites current SCORE_CEILING_BY_FAILURE values without editing source modules"

patterns-established:
  - "CalibrationAdjustmentEvidence JSON with corpusItemIds, sliceStats, and per-item scoreDelta refs"
  - "toAdjustmentProposalSummaries embeds evidenceCount in CalibrationReport.adjustments"

requirements-completed: [CALIB-03]

duration: 4min
completed: 2026-06-17
---

# Phase 130 Plan 03: Versioned Rubric/Gate Adjustment Proposal Registry Summary

**Postgres-backed proposed adjustment registry with corpus-evidence auto-proposals and runScoreCalibration orchestrator — no gate/rubric code edits**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-17T11:35:00Z
- **Completed:** 2026-06-17T11:39:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- `rubric_calibration_adjustments` table stores versioned proposed adjustments with bounded evidence JSON
- `proposeAdjustments` auto-generates proposals when composite slices exceed |meanSignedDelta| ≥ 15 with n ≥ 3
- `runScoreCalibration` orchestrates corpus join → comparisons → report → proposals → deduped persistence

## Task Commits

Each task was committed atomically (TDD RED + GREEN per task):

1. **Task 1: Adjustment schema and repository** — `4703c9a7` (test), `d3c61366` (feat)
2. **Task 2: Auto-propose adjustments from divergence slices** — `f3620e02` (test), `e428105e` (feat)
3. **Task 3: Calibration service orchestrator** — `5e325527` (feat)

**Plan metadata:** pending (docs commit)

## Files Created/Modified

- `app/drizzle/0044_rubric_calibration_adjustments.sql` — Postgres migration for adjustment registry
- `app/src/server/db/schema.ts` — Drizzle table with status and target_module checks
- `app/src/server/repositories/rubric-calibration-adjustments.ts` — insert/list/find proposed adjustments
- `app/src/server/human-quality/calibration/adjustments.ts` — proposeAdjustments builder and evidence refs
- `app/src/server/human-quality/calibration/service.ts` — runScoreCalibration end-to-end orchestrator
- `app/src/server/human-quality/calibration/failure-bridge.ts` — resolveAdjustmentTarget for module/key mapping
- `app/tests/unit/human-quality/calibration-adjustments-repository.test.ts` — 3 repository tests
- `app/tests/unit/human-quality/calibration/adjustments.test.ts` — 8 proposal and orchestrator tests

## Decisions Made

- Unique index on slice_key + adjustment_version + target_module + target_key prevents duplicate proposals per calibration run
- Visual failure reasons resolve to score_ceiling when a ceiling key exists; factual_issue uses gate_classifier exclusively
- No modifications to observable-rubric.ts, creative-quality-gate.ts, or creative-score-ceilings.ts — Phase 132 applies accepted proposals

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CALIB-03 complete — adjustment proposals persist as `proposed` with corpus evidence
- Plan 130-04 can wire CLI evidence script, API route, and calibration UI tab to `runScoreCalibration`
- Migration `0044_rubric_calibration_adjustments.sql` must be applied before production persistence

---
*Phase: 130-score-calibration-and-rubric-alignment*
*Completed: 2026-06-17*

## Self-Check: PASSED

- All key files present on disk
- Task commits 4703c9a7, d3c61366, f3620e02, e428105e, 5e325527 verified in git log
