---
phase: 180-action-contracts
plan: 03
subsystem: api
tags: [assistant, action-contracts, zod, policy, vitest, propose-action]

requires:
  - phase: 180-action-contracts
    provides: ACTION_CONTRACT_REGISTRY with quick_restyle and start_complete_campaign contracts
provides:
  - validateProposeAction contract gate (registry, Zod, roles, risk copy)
  - Registry-enforced propose_action with enriched display metadata
  - Policy deny mapping for AssistantActionValidationError
affects: [180-04, 182-action-execution]

tech-stack:
  added: []
  patterns:
    - "validateProposeAction before createAssistantAction for ACT-02 enforcement"
    - "Policy catches AssistantActionValidationError → contract_validation_failed"

key-files:
  created:
    - app/src/server/assistant/action-contracts/validate.ts
    - app/src/server/assistant/action-contracts/validate.test.ts
  modified:
    - app/src/server/assistant/tools/stubs/propose-action.ts
    - app/src/server/assistant/tools/policy.ts
    - app/src/server/assistant/tools/policy.test.ts

key-decisions:
  - "WorkspaceAuthError from requireRole propagates to policy (forbidden); contract errors map to contract_validation_failed"
  - "Missing optional inputs produce riskCopyLines in display without blocking propose"
  - "createAssistantAction receives enriched display with confirmationPolicy required"

patterns-established:
  - "Pattern: validateProposeAction gates propose_action before persistence"
  - "Pattern: evaluateToolCall try/catch on handler for AssistantActionValidationError"

requirements-completed: [ACT-02, EXEC-01]

duration: 8min
completed: 2026-06-25
---

# Phase 180 Plan 03: Contract Validation at Propose Summary

**Registry-enforced propose_action with Zod validation, role gate, risk copy in display, and policy deny for contract failures — pending cards only with confirmationPolicy required.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-25T19:10:00Z
- **Completed:** 2026-06-25T19:18:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `validateProposeAction` enforces registry lookup, per-contract Zod schema, and `requireRole` against contract `allowedRoles`
- `buildRiskCopyLines` surfaces optional-field warnings in display without blocking valid proposes
- `handleProposeAction` passes enriched display (riskLabel, creditImpact, confirmationPolicy, riskCopyLines) to `createAssistantAction`
- `evaluateToolCall` maps `AssistantActionValidationError` to `deny("contract_validation_failed")` without leaking exceptions
- Policy tests use `quick_restyle` with valid UUID fixtures; unregistered `restyle` actionType is denied

## Task Commits

Each task was committed atomically (TDD test → feat):

1. **Task 1: Implement validateProposeAction contract gate** - `3d7037c3` (test), `3c7eade7` (feat)
2. **Task 2: Wire propose_action and policy error handling** - `477d1c05` (test), `09629a08` (feat)

**Plan metadata:** `7d89e2f8` (docs: complete plan)

## Files Created/Modified

- `app/src/server/assistant/action-contracts/validate.ts` - Contract gate: registry, schema, roles, display enrichment
- `app/src/server/assistant/action-contracts/validate.test.ts` - 6 unit tests with mocked requireRole
- `app/src/server/assistant/tools/stubs/propose-action.ts` - Calls validateProposeAction before createAssistantAction
- `app/src/server/assistant/tools/policy.ts` - Catches AssistantActionValidationError in handler try/catch
- `app/src/server/assistant/tools/policy.test.ts` - Contract validation deny/allow and forbidden role tests

## Decisions Made

- WorkspaceAuthError propagates from validateProposeAction to policy unchanged (forbidden denial)
- Contract validation errors never reach createAssistantAction — policy returns deny before persistence
- Tool-level allowedRoles remain superset; contract may further restrict per action type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Partial mock for assistant-action in policy tests**
- **Found during:** Task 2 (policy test execution)
- **Issue:** Full mock of `@/server/repositories/assistant-action` omitted `AssistantActionValidationError`, breaking `instanceof` in policy catch
- **Fix:** Switched to `importOriginal` partial mock preserving real error class
- **Files modified:** `app/src/server/assistant/tools/policy.test.ts`
- **Verification:** 14/14 tests pass across validate and policy suites
- **Committed in:** `477d1c05`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Test infrastructure fix only; no production behavior change.

## Issues Encountered

- Vitest `-x` flag not supported in project vitest v4 — used `--config config/vitest.config.ts` instead

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can add `revalidateOnConfirm` for confirm-time contract revalidation
- Execution deferred until Phase 182+; pending cards carry `confirmationPolicy: "required"` metadata

## Self-Check: PASSED

- FOUND: app/src/server/assistant/action-contracts/validate.ts
- FOUND: app/src/server/assistant/action-contracts/validate.test.ts
- FOUND: 3d7037c3, 3c7eade7, 477d1c05, 09629a08

---
*Phase: 180-action-contracts*
*Completed: 2026-06-25*
