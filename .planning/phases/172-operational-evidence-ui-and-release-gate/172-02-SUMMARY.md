---
phase: 172-operational-evidence-ui-and-release-gate
plan: 02
subsystem: ui
tags: [react, factual-alerts, owner-quality, integration-tests, vitest]

requires:
  - phase: 172-operational-evidence-ui-and-release-gate
    plan: 01
    provides: FactualAlertsPanel component and fetchFactualAlerts helper
provides:
  - FactualAlertsPanel mounted on HumanQualityCorpusPanel Learning tab (workspace scope)
  - Brand-scoped FactualAlertsPanel on OwnerCalibrationPanel Propostas tab
  - Integration tests proving fetch wiring and DOM order on both surfaces
affects:
  - 172-03-PLAN.md (release gate UI evidence checks)

tech-stack:
  added: []
  patterns:
    - "Factual guard section rendered above LearningProposalsTab with space-y-6 separation"
    - "Integration tests assert mock.calls URL scoping instead of toHaveBeenCalledWith second arg"

key-files:
  created: []
  modified:
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/admin/OwnerCalibrationPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx
    - app/src/components/admin/OwnerCalibrationPanel.test.tsx

key-decisions:
  - "Workspace Learning tab uses variant=workspace without clientProfileId per global corpus operator scope"
  - "Propostas tab wraps alerts + proposals in space-y-6 div preserving existing tab structure"

patterns-established:
  - "Owner quality surfaces show factual alerts before learning proposals (D-03 separation)"

requirements-completed: [ALERT-01, ALERT-03]

duration: 8min
completed: 2026-06-25
---

# Phase 172 Plan 02: Factual Alerts Panel Mounting Summary

**FactualAlertsPanel integrated into corpus Learning and calibration Propostas tabs with workspace/brand scoping and integration tests proving fetch order**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-25T09:12:00Z
- **Completed:** 2026-06-25T09:20:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- HumanQualityCorpusPanel Learning tab renders workspace-scoped `FactualAlertsPanel` above `LearningProposalsTab`
- OwnerCalibrationPanel Propostas tab renders brand-scoped alerts with `workspaceId` and `clientProfileId` above proposals
- Integration tests verify factual-alerts API fetch URLs, DOM order (alerts before proposals), and unchanged proposal tab props

## Task Commits

1. **Task 1: Mount FactualAlertsPanel in HumanQualityCorpusPanel Learning tab** - `93bbe020` (feat)
2. **Task 2: Mount brand-scoped FactualAlertsPanel in OwnerCalibrationPanel** - `11f0c650` (feat)
3. **Task 3: Integration tests for factual-alerts fetch on both surfaces** - `7369faa0` (test)

## Files Created/Modified

- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` — Learning tab composition with factual alerts section first
- `app/src/components/admin/OwnerCalibrationPanel.tsx` — Propostas tab with brand-variant factual alerts above proposals
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` — Learning tab factual-alerts fetch and DOM order test
- `app/src/components/admin/OwnerCalibrationPanel.test.tsx` — Propostas tab brand-scoped fetch test

## Decisions Made

- Workspace Learning tab omits `clientProfileId` — global corpus operators see workspace-level alerts only
- Both surfaces use `space-y-6` wrapper for visual separation between factual guard and proposal sections

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertions use mock.calls find instead of toHaveBeenCalledWith(undefined)**
- **Found during:** Task 3
- **Issue:** `toHaveBeenCalledWith(url, undefined)` failed because `apiFetch` is invoked with a single argument
- **Fix:** Assert via `mockApiFetch.mock.calls.find` checking URL string contents
- **Files modified:** `HumanQualityCorpusPanel.test.tsx`, `OwnerCalibrationPanel.test.tsx`
- **Committed in:** `7369faa0`

---

**Total deviations:** 1 auto-fixed (1 bug/test alignment)
**Impact on plan:** Test adjustment only; composition and fetch behavior match plan intent.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Factual alerts visible in both owner quality surfaces per ALERT-01
- Plan 03 can wire release gate UI evidence checks against mounted alert surfaces

## Self-Check: PASSED

- FOUND: app/src/components/feedback/HumanQualityCorpusPanel.tsx
- FOUND: app/src/components/admin/OwnerCalibrationPanel.tsx
- FOUND: app/src/components/feedback/HumanQualityCorpusPanel.test.tsx
- FOUND: app/src/components/admin/OwnerCalibrationPanel.test.tsx
- FOUND: .planning/phases/172-operational-evidence-ui-and-release-gate/172-02-SUMMARY.md
- FOUND: 93bbe020, 11f0c650, 7369faa0

---
*Phase: 172-operational-evidence-ui-and-release-gate*
*Completed: 2026-06-25*
