---
phase: 171-persistent-product-trust-baseline
plan: 04
subsystem: ui
tags: [vitest, zustand, settings-tabs, regression-guard, trust-baseline]

requires:
  - phase: 171-02
    provides: ProfileTab wired to use-user-profile hooks
  - phase: 171-03
    provides: WorkspaceTab wired to use-workspace-settings hooks
provides:
  - Honest profile/workspace tab enablement with brandKit default preserved
  - Zustand store demoted to UI-only slices (no mock profile/workspace persistence)
  - TRUST-05 regression guard for brand kit and billing hook exports
affects: []

tech-stack:
  added: []
  patterns:
    - "defaultTabId pinned to brandKit while profile/workspace navigable via ?tab="
    - "Settings regression smoke tests import hook exports without rendering tabs"

key-files:
  created:
    - app/tests/unit/settings/settings-regression.test.ts
  modified:
    - app/src/app/(dashboard)/settings/settings-tabs.ts
    - app/src/app/(dashboard)/settings/settings-nav.test.ts
    - app/src/lib/store.ts
    - .planning/phases/171-persistent-product-trust-baseline/171-VALIDATION.md

key-decisions:
  - "defaultTabId explicitly set to brandKit — enabling profile first in array would break first-enabled-tab heuristic"
  - "Removed profile/workspaceSettings from Zustand; API hooks are sole persistence source"

patterns-established:
  - "TRUST-05 regression file documents untouched surfaces: brand kit, team, billing, credit history, plans, privacy"

requirements-completed: [TRUST-03, TRUST-05]

duration: 12min
completed: 2026-06-25
---

# Phase 171 Plan 04: Tab Enablement and Regression Guard Summary

**Profile and workspace tabs enabled with brandKit default preserved, Zustand mock persistence removed, and TRUST-05 regression guard for billing/brand-kit hooks**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-25T05:57:00Z
- **Completed:** 2026-06-25T05:59:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Enabled profile and workspace settings tabs (`enabled: true`) while integrations stays disabled
- Pinned `defaultTabId` to `brandKit` so existing bookmarks and default landing behavior unchanged
- Updated nav tests for profile/workspace resolution and integrations fallback
- Removed misleading Zustand `profile`/`workspaceSettings` mock state and update actions
- Added `settings-regression.test.ts` guarding brand-kit and billing hook exports plus tab enable flags

## Task Commits

Each task was committed atomically:

1. **Task 1: Enable tabs and update navigation tests** - `e14c137e` (test RED) + `b0f40d69` (feat GREEN)
2. **Task 2: Demote Zustand mock state and add regression guard** - `4c8797a7` (feat)

## Files Created/Modified

- `app/src/app/(dashboard)/settings/settings-tabs.ts` — profile/workspace enabled; brandKit default pinned
- `app/src/app/(dashboard)/settings/settings-nav.test.ts` — updated enable/fallback expectations
- `app/src/lib/store.ts` — removed profile/workspace mock slices and actions
- `app/tests/unit/settings/settings-regression.test.ts` — TRUST-05 hook export and tab flag guards
- `.planning/phases/171-persistent-product-trust-baseline/171-VALIDATION.md` — wave statuses marked green

## Decisions Made

- `defaultTabId` is explicitly `"brandKit"` rather than first-enabled-in-array — enabling profile/workspace at list top would have shifted default away from brandKit (CONTEXT D-03)
- No consumers of `updateProfile`/`updateWorkspaceSettings` Zustand actions remained after Plans 02–03; safe to remove

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Pin defaultTabId to brandKit**
- **Found during:** Task 1 (Enable tabs)
- **Issue:** Enabling profile made it first enabled tab, breaking `resolveSettingsTab(null)` and integrations fallback expectations (returned `"profile"` instead of `"brandKit"`)
- **Fix:** Set `defaultTabId: SettingsTabId = "brandKit"` explicitly instead of `find(first enabled)`
- **Files modified:** `app/src/app/(dashboard)/settings/settings-tabs.ts`
- **Verification:** Nav tests pass; integrations fallback returns brandKit
- **Committed in:** `b0f40d69`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for CONTEXT D-03 default tab contract. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 171 complete — all four plans shipped with full validation suite green (40 tests)
- Ready for Phase 172 or phase-level verification sign-off

## Self-Check: PASSED

- FOUND: app/tests/unit/settings/settings-regression.test.ts
- FOUND: app/src/app/(dashboard)/settings/settings-tabs.ts
- FOUND: e14c137e
- FOUND: b0f40d69
- FOUND: 4c8797a7

---
*Phase: 171-persistent-product-trust-baseline*
*Completed: 2026-06-25*
