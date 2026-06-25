---
phase: 180-action-contracts
plan: 01
subsystem: api
tags: [zod, action-contracts, assistant, vitest, registry]

# Dependency graph
requires:
  - phase: 179-tool-policy
    provides: strict Zod tool schemas and deny-by-default policy pattern
  - phase: 178-assistant-foundation
    provides: assistant action persistence and thread scope
provides:
  - Typed ActionContract grammar with central registry
  - registerActionContract for add-only Phase 182 extension
  - buildRiskCopyLines for deterministic pt-BR optional-field warnings
  - quick_restyle and start_complete_campaign example contracts
affects: [180-03, 180-04, 182-quick-actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ACTION_CONTRACT_REGISTRY mirroring TOOL_REGISTRY"
    - "Side-effect contract registration via contracts/index.ts"
    - "CreditImpact creditAction kind referencing CREDIT_COSTS"

key-files:
  created:
    - app/src/server/assistant/action-contracts/types.ts
    - app/src/server/assistant/action-contracts/registry.ts
    - app/src/server/assistant/action-contracts/risk-copy.ts
    - app/src/server/assistant/action-contracts/index.ts
    - app/src/server/assistant/action-contracts/contracts/quick-restyle.ts
    - app/src/server/assistant/action-contracts/contracts/start-complete-campaign.ts
    - app/src/server/assistant/action-contracts/contracts/index.ts
    - app/src/server/assistant/action-contracts/registry.test.ts
    - app/src/server/assistant/action-contracts/risk-copy.test.ts
  modified: []

key-decisions:
  - "creditImpact uses creditAction kind referencing CREDIT_COSTS per RESEARCH A2"
  - "Barrel index.ts loads contracts instead of registry.ts side-effect import to avoid circular module init"
  - "Both example contracts use confirmationPolicy required per EXEC-01"

patterns-established:
  - "ActionContract declares actionType, requiredFields, optionalFields with risk templates, allowedRoles, riskLabel, creditImpact, confirmationPolicy"
  - "Missing optional fields produce deterministic risk copy without blocking propose"

requirements-completed: [ACT-02]

# Metrics
duration: 2min
completed: 2026-06-25
---

# Phase 180 Plan 01: Action Contract Foundation Summary

**Typed action-contract registry with quick_restyle and start_complete_campaign contracts, CREDIT_COSTS-linked creditImpact, and deterministic pt-BR risk-copy builder**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-25T19:13:55Z
- **Completed:** 2026-06-25T19:15:48Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Established `ActionContract` type grammar with `ConfirmationPolicy`, `RiskLabel`, `IntentFamily`, and `CreditImpact` discriminated union
- Implemented `ACTION_CONTRACT_REGISTRY` with `registerActionContract` and `getActionContract` mirroring `TOOL_REGISTRY`
- Added `buildRiskCopyLines` for static pt-BR templates on missing optional fields
- Registered `quick_restyle` (quick_action, restyling credits) and `start_complete_campaign` (complete_campaign, creative_plan credits) with strict Zod schemas

## Task Commits

Each task was committed atomically:

1. **Task 1: Define action-contract types, registry, and risk-copy builder** - `c9062222` (feat)
2. **Task 2: Register quick_restyle and start_complete_campaign example contracts** - `85abf99e` (test RED), `12e37ede` (feat GREEN)

**Plan metadata:** `eea6fc5a` (docs: complete plan)

## Files Created/Modified

- `app/src/server/assistant/action-contracts/types.ts` - Core ActionContract and related types
- `app/src/server/assistant/action-contracts/registry.ts` - Central registry with register/get helpers
- `app/src/server/assistant/action-contracts/risk-copy.ts` - buildRiskCopyLines for missing optionals
- `app/src/server/assistant/action-contracts/index.ts` - Barrel entry that loads contracts without circular imports
- `app/src/server/assistant/action-contracts/contracts/quick-restyle.ts` - quick_restyle contract with strict Zod schema
- `app/src/server/assistant/action-contracts/contracts/start-complete-campaign.ts` - start_complete_campaign contract
- `app/src/server/assistant/action-contracts/contracts/index.ts` - Side-effect registration of both contracts
- `app/src/server/assistant/action-contracts/registry.test.ts` - Registry presence and confirmationPolicy tests
- `app/src/server/assistant/action-contracts/risk-copy.test.ts` - Risk copy line generation tests

## Decisions Made

- Used `creditAction` kind with `CREDIT_COSTS` references instead of hardcoded credit amounts
- Both example contracts require confirmation (`confirmationPolicy: "required"`) per EXEC-01
- Contract loading via `index.ts` barrel instead of `import "./contracts"` at bottom of `registry.ts` to avoid ESM circular initialization

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided circular import in registry.ts**
- **Found during:** Task 2 (contract registration)
- **Issue:** `import "./contracts"` at bottom of `registry.ts` caused `ReferenceError: Cannot access 'ACTION_CONTRACT_REGISTRY' before initialization` because `contracts/index.ts` imports `registerActionContract` from `registry.ts`
- **Fix:** Removed side-effect import from `registry.ts`; added `index.ts` barrel that imports `./contracts` then re-exports registry; tests import `./contracts` before registry
- **Files modified:** `registry.ts`, `index.ts`, `registry.test.ts`
- **Verification:** `npx vitest run --config config/vitest.config.ts src/server/assistant/action-contracts/` passes (14 tests)
- **Committed in:** `12e37ede`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for module initialization correctness. `registerActionContract` add-only extension pattern preserved.

## Issues Encountered

- Vitest plan verify command used `-x` flag unsupported in v4.1.5; ran with `--config config/vitest.config.ts` instead

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Registry foundation ready for Plan 03 `validate.ts` integration in `propose_action`
- Phase 182 can add ACT-04 contracts via `registerActionContract` without registry refactor
- Consumers should import from `@/server/assistant/action-contracts` (barrel) or explicitly `import "./contracts"` before registry access

---
*Phase: 180-action-contracts*
*Completed: 2026-06-25*

## Self-Check: PASSED

- All 9 key files found on disk
- Commits c9062222, 85abf99e, 12e37ede verified in git history
