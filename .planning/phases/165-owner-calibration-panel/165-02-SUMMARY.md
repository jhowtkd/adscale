---
phase: 165-owner-calibration-panel
plan: 02
subsystem: ui
tags: [react, tanstack-query, vitest, owner-panel, brand-calibration]

requires:
  - phase: 165-owner-calibration-panel
    plan: 01
    provides: GET brands/profile/rules owner APIs with fixtureOnly helpers
provides:
  - OwnerCalibrationPanel tabbed shell with cross-workspace brand combobox
  - BrandTasteProfilePanel with honest PANEL-04 status copy and pattern groups
  - BrandCalibrationRulesPanel read-only approved/candidate rules tables
  - Unified /admin/quality/brands/[clientProfileId] calibration page
affects:
  - 165-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Shared react-query key brand-taste-profile for panel gate and Profile tab"
    - "Pure calibration-status-copy.ts for PANEL-04 honesty without server imports"
    - "403 forbidden UX parity across profile, rules, voice, and panel gate"

key-files:
  created:
    - app/src/components/admin/calibration-status-copy.ts
    - app/src/components/admin/calibration-status-copy.test.ts
    - app/src/components/admin/BrandTasteProfilePanel.tsx
    - app/src/components/admin/BrandTasteProfilePanel.test.tsx
    - app/src/components/admin/BrandCalibrationRulesPanel.tsx
    - app/src/components/admin/BrandCalibrationRulesPanel.test.tsx
    - app/src/components/admin/OwnerCalibrationPanel.tsx
    - app/src/components/admin/OwnerCalibrationPanel.test.tsx
  modified:
    - app/src/app/(dashboard)/admin/quality/brands/[clientProfileId]/page.tsx

key-decisions:
  - "Panel-level profile 403 gate blocks tabs before rendering child panels (PANEL-05)"
  - "Evidence labels use neutral PT-BR operator copy; warning banner when fixtureOnly or zero real_customer"
  - "Proposals tab deferred to Plan 165-03 per plan scope"

patterns-established:
  - "Owner calibration UI composes existing BrandVoiceInspectPanel on Voice tab without modification"
  - "Pattern group tables mirror LearningProposalsTab compact border/text-xs styling"

requirements-completed: [PANEL-01, PANEL-02, PANEL-04, PANEL-05]

duration: 4min
completed: 2026-06-24
---

# Phase 165 Plan 02: Owner Calibration Panel UI Summary

**Tabbed OwnerCalibrationPanel with honest fixture-only status copy, taste profile pattern groups, and read-only rules tables on the brand calibration route**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-24T17:06:39Z
- **Completed:** 2026-06-24T17:10:30Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Owner selects brands from combobox populated via `GET /api/admin/quality/brands` without pasting UUIDs
- Profile tab shows evidence level, source composition, caveats, and positive/rejection/quase pattern groups
- Rules tab lists approved and candidate calibration rules in separate read-only sections
- Voice tab reuses `BrandVoiceInspectPanel` unchanged
- Fixture-only brands show warning banner — never marketing "fully calibrated" copy
- Non-owner 403 surfaces panel-level restricted message before tabs render

## Task Commits

Each task was committed atomically:

1. **Task 1: Calibration status copy helper + Profile tab** - `3f5d39ce` (feat)
2. **Task 2: Rules tab panel** - `4013aac5` (feat)
3. **Task 3: OwnerCalibrationPanel shell + page integration** - `579c8ac3` (feat)

## Files Created/Modified

- `app/src/components/admin/calibration-status-copy.ts` - Pure PT-BR evidence labels and fixture-only warning logic
- `app/src/components/admin/BrandTasteProfilePanel.tsx` - Profile tab with composition, caveats, pattern groups
- `app/src/components/admin/BrandCalibrationRulesPanel.tsx` - Approved/candidate rules tables
- `app/src/components/admin/OwnerCalibrationPanel.tsx` - Brand selector, ResponsiveTabs, panel gate
- `app/src/app/(dashboard)/admin/quality/brands/[clientProfileId]/page.tsx` - Unified calibration page

## Decisions Made

- Profile gate query shares `["brand-taste-profile", clientProfileId]` key with Profile tab for cache deduplication
- Loading state shown while profile gate resolves to avoid flashing tabs before forbidden detection
- Rules panel is read-only; proposal accept/reject deferred to Plan 165-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Partial mock for BrandTasteProfilePanel in shell tests**
- **Found during:** Task 3 (OwnerCalibrationPanel tests)
- **Issue:** Full module mock replaced `fetchBrandTasteProfile`, breaking panel-level 403 gate test
- **Fix:** Use `importOriginal` partial mock keeping real `fetchBrandTasteProfile`
- **Files modified:** `app/src/components/admin/OwnerCalibrationPanel.test.tsx`
- **Committed in:** `579c8ac3`

**2. [Rule 2 - Missing Critical] Profile gate loading state**
- **Found during:** Task 3 (forbidden UX)
- **Issue:** Panel rendered full UI while profile gate query was in flight
- **Fix:** Return loading copy until profile gate query settles, then check forbidden
- **Files modified:** `app/src/components/admin/OwnerCalibrationPanel.tsx`
- **Committed in:** `579c8ac3`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical UX)
**Impact on plan:** Both required for correct PANEL-05 forbidden behavior and test reliability.

## TDD Gate Compliance

Test and implementation were committed together per task (not separate RED/GREEN commits). All 16 component tests pass.

## Issues Encountered

None blocking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 165-03 can add Proposals tab by extending `OwnerCalibrationPanel` tabs and refactoring `LearningProposalsTab` with `clientProfileId`
- Brand route and panel shell ready for proposal accept/reject with fixture acknowledgment

## Self-Check: PASSED

- FOUND: app/src/components/admin/OwnerCalibrationPanel.tsx
- FOUND: app/src/components/admin/BrandTasteProfilePanel.tsx
- FOUND: app/src/components/admin/BrandCalibrationRulesPanel.tsx
- FOUND: app/src/components/admin/calibration-status-copy.ts
- FOUND: commit 3f5d39ce
- FOUND: commit 4013aac5
- FOUND: commit 579c8ac3

---
*Phase: 165-owner-calibration-panel*
*Completed: 2026-06-24*
