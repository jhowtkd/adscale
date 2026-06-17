---
phase: 132-targeted-creative-quality-improvements
plan: "01"
subsystem: api
tags: [drizzle, postgres, zod, human-quality, calibration, rubric]

requires:
  - phase: 130-score-calibration-and-rubric-alignment
    provides: proposed rubric_calibration_adjustments rows, failure-bridge targets, MIN_SLICE_SAMPLE
provides:
  - Postgres accept lifecycle (proposed → accepted → superseded) with reviewer audit
  - Evidence-bound buildApplyPlan contract for Phase 132-02 module edits
  - PATCH accept API gated by requireCalibrationAccess
  - RUBRIC_CALIBRATION_VERSION 1.1.0 apply tranche signal
affects:
  - 132-02 evidence-bound ceiling/rubric/gate edits
  - 132-03 regression guard wiring
  - 132-04 re-evaluation report

tech-stack:
  added: []
  patterns:
    - "acceptProposedAdjustment supersede-then-accept in db.transaction"
    - "buildApplyPlan filters accepted rows with corpusItemIds >= MIN_SLICE_SAMPLE"
    - "factual_issue accepted rows flagged applyKind=factual_guard_only"
    - "QualityImprovementChangeSpec Zod bounds on ceilingDelta ±5 and gateMarkerAdditions max 10"

key-files:
  created:
    - app/drizzle/0046_rubric_calibration_accept_metadata.sql
    - app/src/server/human-quality/improvement/types.ts
    - app/src/server/human-quality/improvement/accept.ts
    - app/src/server/human-quality/improvement/apply.ts
    - app/src/server/repositories/calibration-adjustment-errors.ts
    - app/src/app/api/feedback/calibration-adjustments/[id]/accept/route.ts
    - app/tests/unit/human-quality/improvement/accept.test.ts
    - app/tests/unit/human-quality/improvement/apply.test.ts
    - app/src/app/api/feedback/calibration-adjustments/[id]/accept/route.test.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/repositories/rubric-calibration-adjustments.ts
    - app/src/server/human-quality/calibration/report.ts
    - app/drizzle/meta/_journal.json
    - app/tests/unit/human-quality/calibration/adjustments.test.ts

key-decisions:
  - "Store bounded changeSpec as jsonb on rubric_calibration_adjustments row"
  - "accepted_by references user.id as text audit field with ON DELETE SET NULL"
  - "Bump RUBRIC_CALIBRATION_VERSION to 1.1.0 signaling Phase 132 apply tranche"

patterns-established:
  - "CalibrationAdjustmentError codes for not_found, not_proposed, insufficient_evidence"
  - "resolveAdjustmentTarget from sliceKey — apply plan never invents module targets"
  - "computeBoundedCeiling clamps delta ±5 and result [0,100] for 132-02 consumers"

requirements-completed: [QUALITY-02]

duration: 15min
completed: 2026-06-17
---

# Phase 132 Plan 01: Accept Lifecycle and Evidence-Bound Apply Contracts Summary

**Postgres accept lifecycle for proposed calibration adjustments, evidence-filtered apply plan builder, and owner PATCH API with RUBRIC_CALIBRATION_VERSION 1.1.0.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-17T13:54:00Z
- **Completed:** 2026-06-17T14:00:00Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Migration 0046 adds `accepted_at`, `accepted_by`, `change_spec` columns with reviewer audit trail
- Repository supports `acceptAdjustment`, `listAcceptedAdjustments`, `supersedeAcceptedForSlice` with MIN_SLICE_SAMPLE gate
- `acceptProposedAdjustment` orchestrates supersede-then-accept in transaction
- `buildApplyPlan` returns only accepted rows with valid evidence, failure-bridge-bound targets
- PATCH `/api/feedback/calibration-adjustments/[id]/accept` with platform-owner/workspace-admin auth

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration and repository accept lifecycle** - `5aa2f543` (feat)
2. **Task 2: Accept service and apply plan builder** - `23090758` (feat)
3. **Task 3: Accept API and calibration version bump** - `3cc915d2` (feat)

## Files Created/Modified

- `app/drizzle/0046_rubric_calibration_accept_metadata.sql` - Accept metadata columns migration
- `app/src/server/repositories/rubric-calibration-adjustments.ts` - Accept lifecycle repository functions
- `app/src/server/human-quality/improvement/accept.ts` - acceptProposedAdjustment orchestration
- `app/src/server/human-quality/improvement/apply.ts` - buildApplyPlan and computeBoundedCeiling
- `app/src/app/api/feedback/calibration-adjustments/[id]/accept/route.ts` - PATCH accept endpoint

## Decisions Made

- Store optional bounded `changeSpec` on the adjustment row as jsonb (not parsed from rationale)
- Use `accepted_by` text FK to `user.id` for audit; SET NULL on user delete
- Bump default proposal version to 1.1.0 via RUBRIC_CALIBRATION_VERSION constant

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated calibration adjustments test for version 1.1.0**
- **Found during:** Task 3 (calibration version bump)
- **Issue:** `proposeAdjustments` default version test still expected 1.0.0 after bump
- **Fix:** Updated expectation to 1.1.0 in adjustments.test.ts
- **Files modified:** app/tests/unit/human-quality/calibration/adjustments.test.ts
- **Committed in:** 3cc915d2 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test alignment only; no scope change.

## Operator Prerequisite

Before Phase 132-02 module edits, run `npx tsx app/scripts/run-score-calibration.ts` if zero proposals exist, then accept targeted visual slices via PATCH accept API (or future UI).

## Issues Encountered

None

## Next Phase Readiness

- Apply contracts ready for 132-02 to edit ceilings/rubric/gate modules using `buildApplyPlan`
- Operator must accept ≥1 visual calibration proposal before module edits (checkpoint 02-00)
- QUALITY-02 accept chain complete; module apply deferred to 132-02

## Self-Check: PASSED

- FOUND: app/drizzle/0046_rubric_calibration_accept_metadata.sql
- FOUND: app/src/server/human-quality/improvement/accept.ts
- FOUND: app/src/server/human-quality/improvement/apply.ts
- FOUND: app/src/app/api/feedback/calibration-adjustments/[id]/accept/route.ts
- FOUND: commits 5aa2f543, 23090758, 3cc915d2

---
*Phase: 132-targeted-creative-quality-improvements*
*Completed: 2026-06-17*
