---
phase: 180-action-contracts
plan: 04
subsystem: api
tags: [assistant, action-contracts, confirm, revalidation, zod, vitest]

requires:
  - phase: 180-action-contracts
    provides: ACTION_CONTRACT_REGISTRY and validateProposeAction from plans 01/03
provides:
  - revalidateOnConfirm pending gate and schema re-check on stored inputSnapshot
  - Confirm route integration with 400 invalidInput for stale/invalid actions
  - getAssistantMessageById for display.actionType contract lookup
affects: [182-action-execution]

tech-stack:
  added: []
  patterns:
    - "revalidateOnConfirm before confirmAssistantAction — read-only, no inputSnapshot mutation"
    - "display.actionType on action card message is authoritative for confirm-time contract lookup"

key-files:
  created:
    - app/src/server/assistant/action-contracts/confirm-validation.test.ts
    - app/src/app/api/assistant/actions/[actionId]/confirm/route.test.ts
  modified:
    - app/src/server/assistant/action-contracts/validate.ts
    - app/src/server/repositories/assistant-message.ts
    - app/src/app/api/assistant/actions/[actionId]/confirm/route.ts

key-decisions:
  - "Non-pending confirm attempts throw InvalidActionTransitionError (matches transitionAssistantAction semantics)"
  - "AssistantActionValidationError from revalidation maps to 400 invalidInput with safe message"
  - "Contract resolved from action card message display.actionType, not from inputSnapshot"

patterns-established:
  - "Pattern: revalidateOnConfirm gates confirm path without second form or snapshot mutation"
  - "Pattern: confirm route calls revalidateOnConfirm after requireWorkspaceAccess, before status transition"

requirements-completed: [EXEC-01]

duration: 5min
completed: 2026-06-25
---

# Phase 180 Plan 04: Confirm Contract Revalidation Summary

**Light revalidation on confirm: pending status gate, Zod re-check of stored inputSnapshot via display.actionType contract lookup — invalid/stale snapshots blocked before confirmed transition.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-25T19:20:00Z
- **Completed:** 2026-06-25T19:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `revalidateOnConfirm` loads action + action card message, resolves contract from `display.actionType`, and re-validates `inputSnapshot` without mutation
- Confirm route calls `revalidateOnConfirm` after workspace auth and before `confirmAssistantAction`
- `InvalidActionTransitionError` and `AssistantActionValidationError` both map to 400 `invalidInput`
- Added `getAssistantMessageById` repository helper for message payload lookup
- 10 new tests across confirm-validation and route integration; full assistant contract slice (44 tests) green

## Task Commits

Each task was committed atomically (TDD test → feat):

1. **Task 1: Implement revalidateOnConfirm** - `210006ba` (test), `927d6eda` (feat)
2. **Task 2: Integrate revalidation into confirm route** - `9c80108c` (test), `ba713e34` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `app/src/server/assistant/action-contracts/validate.ts` - Added `revalidateOnConfirm` export
- `app/src/server/assistant/action-contracts/confirm-validation.test.ts` - 5 unit tests with mocked repos
- `app/src/server/repositories/assistant-message.ts` - Added `getAssistantMessageById`
- `app/src/app/api/assistant/actions/[actionId]/confirm/route.ts` - Revalidation before confirm transition
- `app/src/app/api/assistant/actions/[actionId]/confirm/route.test.ts` - 5 route integration tests

## Decisions Made

- Used `InvalidActionTransitionError` for non-pending status (consistent with `transitionAssistantAction`)
- Route test auth gate uses real `WorkspaceAuthError` from `@/server/auth/errors` for `handleApiError` recognition
- No orchestrator fixture update needed — `actionType` already `quick_restyle`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest `-x` flag unsupported in this project's vitest version; used `npm test -- --run` with config path instead
- Route tests required `next-intl/server` mock and real `WorkspaceAuthError` from auth/errors for 401 assertion

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EXEC-01 confirm gate complete; confirmed actions have validated snapshots
- Phase 182 can wire execution/credit spend after confirmed status
- No execution or credit spend triggered on confirm (deferred per plan)

## Self-Check: PASSED

- FOUND: app/src/server/assistant/action-contracts/validate.ts
- FOUND: app/src/server/assistant/action-contracts/confirm-validation.test.ts
- FOUND: app/src/app/api/assistant/actions/[actionId]/confirm/route.ts
- FOUND: app/src/app/api/assistant/actions/[actionId]/confirm/route.test.ts
- FOUND: commit 210006ba
- FOUND: commit 927d6eda
- FOUND: commit 9c80108c
- FOUND: commit ba713e34

---
*Phase: 180-action-contracts*
*Completed: 2026-06-25*
