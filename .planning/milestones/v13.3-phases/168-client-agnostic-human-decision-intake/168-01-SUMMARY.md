---
phase: 168-client-agnostic-human-decision-intake
plan: 01
subsystem: api
tags: [human-quality, calibration, output-decision, vitest]

requires: []
provides:
  - Generic human-quality evaluation to output-decision and calibration-signal bridge
  - submitHumanEvaluation decisionEvidence wiring with evaluation-scoped idempotency keys
affects:
  - 168-02-PLAN.md
  - 168-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Compose recordOutputDecisionEvidence + recordCalibrationSignalFromOutputDecisionEvent instead of duplicating repository writes"
    - "Evaluation-scoped idempotency keys for corpus evaluation retries"

key-files:
  created:
    - app/src/server/human-quality/human-decision-calibration.ts
  modified:
    - app/src/server/human-quality/service.ts
    - app/tests/unit/human-quality/human-quality-service.test.ts

key-decisions:
  - "Skip calibration signal when corpus item clientProfileId is null; still record output decision evidence"
  - "Use human-quality-evaluation:{evaluationId} idempotency key prefixes for both output decision and calibration signal"

patterns-established:
  - "Human corpus evaluations map intent approve/reject/regenerate to approved/rejected/regenerated output actions"

requirements-completed: [DECISION-02, DECISION-04, DECISION-05]

duration: 8min
completed: 2026-06-25
---

# Phase 168 Plan 01: Human Decision Calibration Bridge Summary

**Generic corpus evaluations now write canonical output-decision and calibration-signal evidence via a reusable server bridge with evaluation-scoped idempotency.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-25T07:41:00Z
- **Completed:** 2026-06-25T07:49:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `recordHumanDecisionCalibrationEvidence` composing existing output-decision and calibration-signal recorders
- Wired bridge from `submitHumanEvaluation` after feedback artifact creation with backward-compatible `decisionEvidence` field
- Extended unit tests for source labels, global workspace resolution, and client-profile isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add generic human decision calibration bridge** - `afbd8efc` (feat)
2. **Task 2: Wire bridge from submitHumanEvaluation** - `c6393e60` (feat)
3. **Task 3: Extend service tests for source labels and isolation** - `01120bf3` (test)

## Files Created/Modified

- `app/src/server/human-quality/human-decision-calibration.ts` - Maps corpus intent to output actions, builds sanitized snapshots, records evidence with idempotency keys
- `app/src/server/human-quality/service.ts` - Calls bridge after artifact insert; returns `decisionEvidence`
- `app/tests/unit/human-quality/human-quality-service.test.ts` - Mocks recorders; asserts operator_imported, synthetic_fixture, global mode, and profile isolation

## Decisions Made

- When `clientProfileId` is null on the corpus item, output decision evidence is still recorded but calibration signal recording is skipped with `skipped_no_client_profile` status
- Idempotency keys are scoped to evaluation id (`human-quality-evaluation:{id}:output-decision` / `:calibration-signal`) to survive API retries without duplicate signals

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guard missing evaluation.createdAt in bridge**
- **Found during:** Task 2 (service wiring verification)
- **Issue:** Unit test mocks omitted `createdAt`, causing `toISOString` crash when bridge ran
- **Fix:** Use `evaluation.createdAt?.toISOString() ?? new Date().toISOString()`
- **Files modified:** `app/src/server/human-quality/human-decision-calibration.ts`
- **Verification:** All 28 service and route tests pass
- **Committed in:** `c6393e60` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Defensive timestamp fallback required for test mocks and edge cases; no scope creep.

## Issues Encountered

None beyond the createdAt guard noted above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 168-02 can build UI/global queue polish on top of generic evidence writes
- Plan 168-03 can extend evidence report assertions knowing calibration signals now flow from corpus evaluations

---
*Phase: 168-client-agnostic-human-decision-intake*
*Completed: 2026-06-25*

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/human-decision-calibration.ts
- FOUND: app/src/server/human-quality/service.ts
- FOUND: app/tests/unit/human-quality/human-quality-service.test.ts
- FOUND: afbd8efc
- FOUND: c6393e60
- FOUND: 01120bf3
