---
phase: 59-feedback-informed-regeneration
plan: "03"
subsystem: ui
tags: [regeneration, i18n, next-intl, react]
requires:
  - phase: 59-feedback-informed-regeneration
    provides: deriveRegenerationPreview from plan 59-01
provides:
  - Pre-confirm regeneration issue summary in workspace UI
  - regenerationPrimaryReason on derivations list API
affects: []
tech-stack:
  added: []
  patterns: [server-computed preview fields on list DTO]
key-files:
  created:
    - app/src/lib/regeneration-preview-types.ts
  modified:
    - app/src/components/workspace/RegenerateFeedbackDialog.tsx
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/app/api/campaigns/[id]/derivations/route.ts
    - app/messages/en.json
    - app/messages/pt-BR.json
key-decisions:
  - "Shared RegenerationIssueBreakdown type in lib to keep client components free of server imports"
patterns-established:
  - "Blocking vs advisory issue groups in dialog; polish-only path stays one-click"
requirements-completed: [AIR-03]
duration: 18min
completed: 2026-06-05
---

# Phase 59 Plan 03: Pre-Confirm Regeneration Reason UI Summary

**Users see a read-only summary of blocking and advisory issues before editing regeneration feedback, with EN/PT-BR labels.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- GET derivations list attaches `regenerationPrimaryReason` and `regenerationIssueBreakdown`
- `RegenerateFeedbackDialog` shows structured summary above textarea
- Workspace hook opens dialog for invalid/hard-failure paths; polish-only remains one-click

## Task Commits

1. **Task 1: Derivations list API preview** - `cb912f7`
2. **Task 2: Dialog and i18n** - `54fde3e`
3. **Task 3: Workspace wiring** - `2ad0cfd`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/src/components/workspace/RegenerateFeedbackDialog.tsx
- FOUND: app/src/lib/regeneration-preview-types.ts
- FOUND: cb912f7, 54fde3e, 2ad0cfd
