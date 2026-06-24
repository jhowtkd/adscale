---
phase: 167-global-cross-client-promotion
plan: "02"
subsystem: api
tags: [vitest, calibration, reject-lifecycle, fixture-ack, drizzle]

requires:
  - phase: 167-01
    provides: cross-client evidenceRefs with fixtureOnly and promotionSource
provides:
  - rejected status lifecycle on rubric_calibration_adjustments
  - PATCH reject API with reason validation
  - acknowledgeFixtureOnly gate on cross_client fixtureOnly accept
affects:
  - 167-03-PLAN

tech-stack:
  added: []
  patterns:
    - "Mirror client_learning_proposals reject with reason + audit fields"
    - "insufficient_acknowledgment error for global fixture-only accept"

key-files:
  created:
    - app/drizzle/0054_rubric_calibration_reject.sql
    - app/src/app/api/feedback/calibration-adjustments/[id]/reject/route.ts
    - app/src/app/api/feedback/calibration-adjustments/[id]/reject/route.test.ts
  modified:
    - app/drizzle/meta/_journal.json
    - app/src/server/db/schema.ts
    - app/src/server/repositories/rubric-calibration-adjustments.ts
    - app/src/server/repositories/calibration-adjustment-errors.ts
    - app/src/server/human-quality/improvement/accept.ts
    - app/src/server/human-quality/improvement/types.ts
    - app/src/app/api/feedback/calibration-adjustments/[id]/accept/route.ts
    - app/tests/unit/human-quality/calibration-adjustments-repository.test.ts
    - app/tests/unit/human-quality/improvement/apply.test.ts
    - app/tests/unit/human-quality/learning/cross-client.test.ts

key-decisions:
  - "Use insufficient_acknowledgment error code (distinct from client proposal fixture_ack_required)"
  - "Fixture ack tests in apply.test.ts where acceptProposedAdjustment mocks already exist"

patterns-established:
  - "Global adjustment reject mirrors client proposal reject without cooldown"

requirements-completed: [GLOBAL-03, GLOBAL-04]

duration: 8min
completed: 2026-06-24
---

# Phase 167 Plan 02: Global Reject Lifecycle + Accept Hardening Summary

**Rejected global calibration adjustments with reason audit trail, PATCH reject API, and acknowledgeFixtureOnly gate for fixture-only cross-client accepts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-24T15:37:00Z
- **Completed:** 2026-06-24T15:45:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Migration 0054 adds `rejected_reason`, `rejected_at`, `rejected_by` and extends status check to include `rejected`
- `rejectAdjustment` repository method with proposed-only guard
- PATCH `/api/feedback/calibration-adjustments/[id]/reject` with Zod reason validation
- `acceptProposedAdjustment` requires `acknowledgeFixtureOnly` when `promotionSource === "cross_client"` and `fixtureOnly === true`
- Accept route extended with `acknowledgeFixtureOnly` body field and 422 mapping for `insufficient_acknowledgment`
- Regression test confirms cross-client detector only persists proposed status

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + reject repository** - `22be53bc` (test RED), `bd3f7f32` (feat GREEN)
2. **Task 2: Reject API + accept fixture ack** - `0a9041f5` (test RED), `0119cd0b` (feat GREEN)

## Files Created/Modified

- `app/drizzle/0054_rubric_calibration_reject.sql` - Rejected columns and status constraint
- `app/src/server/repositories/rubric-calibration-adjustments.ts` - `rejectAdjustment` method
- `app/src/app/api/feedback/calibration-adjustments/[id]/reject/route.ts` - PATCH reject endpoint
- `app/src/server/human-quality/improvement/accept.ts` - Fixture acknowledgment gate
- `app/src/app/api/feedback/calibration-adjustments/[id]/accept/route.ts` - Extended body schema and error mapping

## Decisions Made

- Used `insufficient_acknowledgment` error code per plan contract (client proposals retain `fixture_ack_required`)
- Placed `acceptProposedAdjustment` fixture tests in `apply.test.ts` to avoid conflicting repository mocks in `accept.test.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixture ack tests relocated to apply.test.ts**
- **Found during:** Task 2 (GREEN test run)
- **Issue:** Module-level mock of `rubric-calibration-adjustments` in `accept.test.ts` broke existing repository lifecycle tests
- **Fix:** Restored `accept.test.ts` to repository-only tests; added fixture ack tests to `apply.test.ts` where mocks already exist
- **Files modified:** `app/tests/unit/human-quality/improvement/accept.test.ts`, `app/tests/unit/human-quality/improvement/apply.test.ts`
- **Verification:** 37 tests green across calibration-adjustments routes, accept, apply, cross-client
- **Committed in:** `0119cd0b`

---

**Total deviations:** 1 auto-fixed (1 blocking test infrastructure)
**Impact on plan:** Test placement only; all planned behaviors verified.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GLOBAL-03 and GLOBAL-04 server contracts complete
- Ready for 167-03: Calibration UI consume reject/accept with fixture ack and supportingClientRuleIds

## Self-Check: PASSED

- FOUND: app/drizzle/0054_rubric_calibration_reject.sql
- FOUND: app/src/app/api/feedback/calibration-adjustments/[id]/reject/route.ts
- FOUND: app/src/server/human-quality/improvement/accept.ts
- FOUND: .planning/phases/167-global-cross-client-promotion/167-02-SUMMARY.md
- FOUND: 22be53bc
- FOUND: bd3f7f32
- FOUND: 0a9041f5
- FOUND: 0119cd0b

---
*Phase: 167-global-cross-client-promotion*
*Completed: 2026-06-24*
