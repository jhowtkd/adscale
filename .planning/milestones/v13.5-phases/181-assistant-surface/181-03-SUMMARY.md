---
phase: 181-assistant-surface
plan: 03
subsystem: ui
tags: [nextjs, react, assistant, navigation, i18n, react-query]

requires:
  - phase: 181-assistant-surface
    provides: Plan 01 hooks (threads, create mutations) and Plan 02 AssistantShell
provides:
  - Client → Campaign → Thread navigation sidebar with URL ?threadId= deep links
  - Guided empty state when no thread selected
  - Modal create flows for client profile, campaign draft, and named thread
  - AssistantSurfaceContext bridging main empty-state CTAs to sidebar dialogs
affects: [181-04, 181-05]

tech-stack:
  added: []
  patterns:
    - "Campaign list filtered client-side from useCampaigns({ limit: 100 })"
    - "Thread selection syncs via router.replace /assistant?threadId="
    - "campaignId=null sentinel for client-level threads in tree"

key-files:
  created:
    - app/src/components/assistant/AssistantTreeSidebar.tsx
    - app/src/components/assistant/AssistantTreeSidebar.test.tsx
    - app/src/components/assistant/AssistantEmptyState.tsx
    - app/src/components/assistant/AssistantCreateClientDialog.tsx
    - app/src/components/assistant/AssistantCreateCampaignDialog.tsx
    - app/src/components/assistant/AssistantCreateThreadDialog.tsx
    - app/src/components/assistant/AssistantSidebarPanel.tsx
    - app/src/components/assistant/AssistantSurfaceContext.tsx
    - app/src/components/assistant/AssistantMain.tsx
  modified:
    - app/src/app/(dashboard)/assistant/layout.tsx
    - app/src/app/(dashboard)/assistant/page.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json

key-decisions:
  - "AssistantSurfaceContext uses ref-based handlers to wire empty-state CTAs to sidebar dialogs without prop drilling across shell slots"
  - "Campaign create always passes clientProfileId from tree context (T-181-07 mitigation)"
  - "Client-level threads use useAssistantThreads(clientId, null) separate from campaign threads"

patterns-established:
  - "Pattern: AssistantSidebarPanel owns URL threadId via useSearchParams and hosts create dialogs"
  - "Pattern: Progressive tree expansion tracked in local component state"

requirements-completed: [CHAT-02, CHAT-03]

duration: 18min
completed: 2026-06-25
---

# Phase 181 Plan 03: CHAT-02/03 Navigation Tree Summary

**Hierarchical Client → Campaign → Thread sidebar with ?threadId= deep links, guided empty state, and modal create flows for client/campaign/thread**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-25T21:14:00Z
- **Completed:** 2026-06-25T21:32:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Three-level navigation tree with progressive expansion and active thread highlight from URL
- Guided empty state with browse-tree and create-client CTAs when no threadId
- CHAT-03 creation chain: client profile, campaign draft (with clientProfileId), and named thread with post-create navigation

## Task Commits

1. **Task 1: Tree sidebar with URL selection** - `41444254` (test), `0dcc328c` (feat)
2. **Task 2: Guided empty state** - `524dd879` (feat)
3. **Task 3: Create flows and shell composition** - `a5e70970` (feat)

## Files Created/Modified

- `app/src/components/assistant/AssistantTreeSidebar.tsx` - Hierarchical tree with header create actions
- `app/src/components/assistant/AssistantTreeSidebar.test.tsx` - Hook-mocked selection and highlight tests
- `app/src/components/assistant/AssistantEmptyState.tsx` - Centered guided CTA panel
- `app/src/components/assistant/AssistantCreateClientDialog.tsx` - useCreateClientProfile modal
- `app/src/components/assistant/AssistantCreateCampaignDialog.tsx` - useCreateCampaign draft modal with clientProfileId
- `app/src/components/assistant/AssistantCreateThreadDialog.tsx` - useCreateAssistantThread modal
- `app/src/components/assistant/AssistantSidebarPanel.tsx` - Sidebar slot wiring URL + dialogs
- `app/src/components/assistant/AssistantSurfaceContext.tsx` - Cross-slot CTA bridge
- `app/src/components/assistant/AssistantMain.tsx` - Main slot empty state vs chat placeholder
- `app/src/app/(dashboard)/assistant/layout.tsx` - Live tree replaces placeholder
- `app/messages/en.json`, `app/messages/pt-BR.json` - assistant.tree, empty, create.* keys

## Decisions Made

- Added `AssistantCreateThreadDialog` and `AssistantSurfaceContext` as composition helpers for header "new thread" and empty-state secondary CTA (plan listed behavior but not every wrapper file)
- Campaign draft uses same bootstrap shape as campaigns list (`client` + `clientProfileId`) per RESEARCH

## Deviations from Plan

None - plan executed with minor composition helpers (`AssistantMain`, `AssistantSidebarPanel`, `AssistantCreateThreadDialog`, `AssistantSurfaceContext`) required to wire shell slots and thread creation modal.

## Known Stubs

| File | Description | Resolved by |
|------|-------------|-------------|
| `AssistantMain.tsx` | "Chat placeholder" when threadId present | Plan 181-04 |
| `assistant/layout.tsx` | Context panel placeholder | Plan 181-04/05 |

## Issues Encountered

- Vitest requires `--config config/vitest.config.ts` (plan verify `-x` flag unsupported)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can replace chat placeholder with `AssistantChatCore` gated on threadId
- Tree navigation and create flows ready for drawer reuse (CHAT-04)

## Self-Check: PASSED

- FOUND: app/src/components/assistant/AssistantTreeSidebar.tsx
- FOUND: app/src/components/assistant/AssistantEmptyState.tsx
- FOUND: app/src/components/assistant/AssistantCreateClientDialog.tsx
- FOUND: app/src/components/assistant/AssistantCreateCampaignDialog.tsx
- FOUND: 41444254, 0dcc328c, 524dd879, a5e70970

---
*Phase: 181-assistant-surface*
*Completed: 2026-06-25*
