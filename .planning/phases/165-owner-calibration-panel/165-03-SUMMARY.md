---
phase: 165-owner-calibration-panel
plan: 03
subsystem: ui
tags: [react, tanstack-query, vitest, learning-proposals, fixture-ack, owner-panel]

requires:
  - phase: 165-owner-calibration-panel
    plan: 02
    provides: OwnerCalibrationPanel tabbed shell with brand combobox and profile gate
provides:
  - Per-brand Propostas tab with clientProfileId-filtered LearningProposalsTab
  - Fixture-only accept acknowledgment checkbox and POST body gate
  - LearningProposalsTab.test.tsx automated PANEL-03 coverage
affects:
  - phase-166-evidence-gate

tech-stack:
  added: []
  patterns:
    - "Optional clientProfileId on LearningProposalsTab preserves corpus workspace-wide tab"
    - "brand variant hides generate button; workspace variant unchanged"
    - "fixtureAcknowledged per-row state gates accept POST with acknowledgeFixtureOnly"

key-files:
  created:
    - app/src/components/feedback/LearningProposalsTab.test.tsx
  modified:
    - app/src/components/feedback/LearningProposalsTab.tsx
    - app/src/components/admin/OwnerCalibrationPanel.tsx
    - app/src/components/admin/OwnerCalibrationPanel.test.tsx
    - app/scripts/capture-ui-screenshots.ts

key-decisions:
  - "workspaceId resolved from brand list query first, profile API workspaceId as fallback"
  - "onOpenCalibration from Propostas tab navigates to Regras tab (not Voice)"
  - "Corpus HumanQualityCorpusPanel Learning tab unchanged — no clientProfileId prop"

patterns-established:
  - "learningProposalsQueryKey includes clientProfileId for cache isolation per brand"

requirements-completed: [PANEL-03, PANEL-04]

duration: 8min
completed: 2026-06-24
---

# Phase 165 Plan 03: Proposals Tab Summary

**Per-brand learning proposals with clientProfileId API filter, fixture-only accept acknowledgment, and Propostas tab in OwnerCalibrationPanel**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-24T14:11:00Z
- **Completed:** 2026-06-24T14:19:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Owner accepts/rejects learning proposals from Propostas tab filtered to selected brand
- Fixture-only proposals require explicit PT-BR acknowledgment checkbox before Accept enables
- Accept POST sends `{ acknowledgeFixtureOnly: true }` matching accept route contract
- Corpus Learning tab in HumanQualityCorpusPanel unchanged (workspace-wide, generate button retained)
- Screenshot capture label updated to "Admin — Owner Calibration Panel"

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: LearningProposalsTab tests** - `6bec479c` (test)
2. **Task 1 GREEN: clientProfileId + fixture ack** - `3425e6ff` (feat)
3. **Task 2: Proposals tab in OwnerCalibrationPanel** - `975ee72e` (feat)
4. **Task 3: Screenshot script + wave verification** - `e5881d13` (chore)

## Files Created/Modified

- `app/src/components/feedback/LearningProposalsTab.test.tsx` - PANEL-03 automated coverage (filter, cache, fixture ack)
- `app/src/components/feedback/LearningProposalsTab.tsx` - clientProfileId filter, variant prop, fixture acknowledgment UI
- `app/src/components/admin/OwnerCalibrationPanel.tsx` - Fourth Propostas tab wiring
- `app/src/components/admin/OwnerCalibrationPanel.test.tsx` - Propostas tab and prop passthrough tests
- `app/scripts/capture-ui-screenshots.ts` - Renamed capture entry for unified panel

## Decisions Made

- workspaceId from brand list avoids extra API round-trip; profile response used as fallback
- Brand variant header copy in PT-BR; generate button hidden for per-brand read-only context
- Checkbox label matches plan spec for operator fixture honesty (T-165-08)

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Separate RED (`6bec479c`) and GREEN (`3425e6ff`) commits present. All 5 LearningProposalsTab tests pass.

## Issues Encountered

Vitest in this project does not exist. Plan verify commands used `-x` flag which is unsupported; ran without it successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 165 complete — all PANEL requirements satisfied
- Phase 166 can build per-brand evidence gate on profile API helpers already exposed in Plan 01

## Self-Check: PASSED

- FOUND: app/src/components/feedback/LearningProposalsTab.test.tsx
- FOUND: app/src/components/feedback/LearningProposalsTab.tsx
- FOUND: app/src/components/admin/OwnerCalibrationPanel.tsx
- FOUND: commit 6bec479c
- FOUND: commit 3425e6ff
- FOUND: commit 975ee72e
- FOUND: commit e5881d13

---
*Phase: 165-owner-calibration-panel*
*Completed: 2026-06-24*
