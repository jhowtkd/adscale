---
phase: 206-version-compare-and-approval
plan: "04"
subsystem: ui
tags: [react, base-ui, tanstack-query, accessibility, artifact-versioning]
requires:
  - phase: 206-version-compare-and-approval
    plan: "02"
    provides: atomic promotion, revision-bound acknowledgements, and typed conflict recovery
  - phase: 206-version-compare-and-approval
    plan: "03"
    provides: strict comparison hooks, canonical thread state, history, and shared comparison requests
provides:
  - Responsive semantic plan and synchronized creative comparison workspace
  - Explicit no-credit promotion with server-backed linked-plan review
  - Single active-thread comparison host with exact scroll and focus restoration
  - Provenance-bound shortcuts on completed version-producing action cards
affects: [207-iterative-copilot-integration, assistant-chat, artifact-approval]
tech-stack:
  added: []
  patterns: [single shared dialog host, local synchronized preview transform, revision-bound acknowledgement validation]
key-files:
  created:
    - app/src/components/assistant/VersionComparisonDialog.tsx
  modified:
    - app/src/components/assistant/AssistantChatCore.tsx
    - app/src/components/assistant/AssistantMessageList.tsx
    - app/src/components/assistant/AssistantActionCard.tsx
    - app/src/components/assistant/AssistantSurfaceContext.tsx
key-decisions:
  - "Comparison UI renders only server-computed safe DTOs and keeps zoom, pan, confirmation, and conflict state local."
  - "Linked-plan review remains valid only while its official version, linked target, and reviewed head revision still match."
  - "The shared surface context captures the initiating element before dialog focus transfer; ChatCore owns exact message scroll restoration."
patterns-established:
  - "Unknown or non-eligible artifact statuses fail closed and never expose an enabled promotion action."
  - "Completed-card version shortcuts resolve provenance.actionId against canonical thread lineage state."
requirements-completed: [COMP-01, COMP-02, APPR-01, APPR-02, APPR-03]
duration: 15min
completed: 2026-06-28
---

# Phase 206 Plan 04: Comparison and Approval Workspace Summary

**Responsive plan and creative comparison now requires explicit revision-safe approval, preserves chat position and focus, and recovers stale conflicts without retrying**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-28T18:15:02Z
- **Completed:** 2026-06-28T18:30:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added a full-height responsive comparison workspace with canonical-order plan changes and synchronized fit-first creative previews.
- Added exact eligibility copy, non-destructive no-credit confirmation, server-backed linked-plan review, busy dismissal locks, success announcements, and persistent 409 recovery.
- Mounted one comparison host in the active chat and restored the exact message-list scroll offset and initiating element after close.
- Added completed-card history and official-comparison shortcuts resolved only through canonical `provenance.actionId` bindings.

## Task Commits

1. **Task 1 RED: comparison workspace behavior** - `5bdbd972` (test)
2. **Task 1 GREEN: responsive comparison and promotion workspace** - `2e4cd8c2` (feat)
3. **Task 2 RED: host, restoration, and shortcut behavior** - `09343cea` (test)
4. **Task 2 GREEN: single comparison host and chat shortcuts** - `cbe8f0eb` (feat)
5. **Verification fix: stale acknowledgement and failure handling** - `9692fd24` (fix)
6. **Verification fix: pre-focus trigger capture** - `81ccaee7` (fix)

## Files Created/Modified

- `app/src/components/assistant/VersionComparisonDialog.tsx` - plan/creative comparison, linked review, confirmation, promotion, and conflict recovery.
- `app/src/components/assistant/AssistantChatCore.tsx` - one active-thread dialog host and scroll/focus restoration owner.
- `app/src/components/assistant/AssistantMessageList.tsx` - exposes the real overflow element and passes canonical lineage state to cards.
- `app/src/components/assistant/AssistantActionCard.tsx` - provenance-bound history and official-comparison shortcuts.
- `app/src/components/assistant/AssistantSurfaceContext.tsx` - captures the initiating element before modal focus transfer.
- Four focused component test files cover semantic confirmation, conflict, pending locks, restoration, refs, and shortcut isolation.

## Decisions Made

- Reused existing Dialog, Select, Button, TanStack Query hooks, and native pointer/wheel/keyboard events; no viewer, diff package, store, or modal manager was added.
- Kept preview load failure independent from promotion eligibility and kept signed preview URLs response-only.
- Kept linked-plan acknowledgement validity derived from the exact reviewed official ID, linked version ID, and head revision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Captured the initiating element in the shared surface context**
- **Found during:** Task 2 lint and focus verification
- **Issue:** The Plan 03 request contract did not actually preserve the trigger before the dialog focus trap activated, so exact focus restoration could race modal mounting.
- **Fix:** Captured `document.activeElement` when opening the shared comparison request and restored it from ChatCore after close.
- **Files modified:** `app/src/components/assistant/AssistantSurfaceContext.tsx`, `app/src/components/assistant/AssistantChatCore.tsx`
- **Verification:** AssistantChatCore integration test proves exact trigger focus and `scrollTop=137` restoration.
- **Committed in:** `81ccaee7`

**2. [Rule 1 - Bug] Invalidated stale linked-plan receipts and surfaced mutation failures**
- **Found during:** Plan-level acceptance review
- **Issue:** A receipt could remain locally truthy after its reviewed official plan or revision changed, and non-conflict failures had no visible recovery copy.
- **Fix:** Derived receipt validity from official/linked IDs plus reviewed revision, disabled repeat success, and added persistent safe failure alerts.
- **Files modified:** `app/src/components/assistant/VersionComparisonDialog.tsx`
- **Verification:** Focused component tests, TypeScript, ESLint, full Vitest suite, and production build pass.
- **Committed in:** `9692fd24`, `81ccaee7`

---

**Total deviations:** 2 auto-fixed (1 missing critical functionality, 1 bug).
**Impact on plan:** Both fixes enforce D-03, D-21, and D-23 without adding architecture or dependencies.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 207 can exercise authenticated desktop/mobile browser flows against the completed comparison, acknowledgement, promotion, and conflict UI.

## Self-Check: PASSED

- All nine scoped files and six task/fix commits exist.
- Focused gate passes 43 tests across seven files.
- Full gate passes 472 files and 3066 tests (4 skipped), TypeScript, and the Next.js production build.
- No dependency, raw snapshot field, signed-URL persistence, billing call, store, viewer, or extra modal manager was added.
- No tracked files were deleted; unrelated beta-feedback, Phase 128, and config changes remain unstaged.

---
*Phase: 206-version-compare-and-approval*
*Completed: 2026-06-28*
