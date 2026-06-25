---
phase: 181-assistant-surface
plan: 04
subsystem: ui
tags: [nextjs, react, assistant, sse, action-cards, i18n, react-query]

requires:
  - phase: 181-assistant-surface
    provides: Plan 01 hooks (chat, threads, actions) and Plan 02/03 shell + navigation
provides:
  - Shared AssistantChatCore with SSE streaming and history merge
  - Inline action cards with contract metadata and confirm/cancel
  - Context panel with contract readiness, suggested actions, job status
  - Fully wired /assistant main column and context panel
affects: [181-05]

tech-stack:
  added: []
  patterns:
    - "Server thread history merged with live useAssistantChat messages"
    - "useAssistantThread pollWhileActive with STALE_TIME.REALTIME for pending/running cards"
    - "Client-side contract-display helpers without server contract imports"

key-files:
  created:
    - app/src/components/assistant/AssistantChatCore.tsx
    - app/src/components/assistant/AssistantChatCore.test.tsx
    - app/src/components/assistant/AssistantChatInput.tsx
    - app/src/components/assistant/AssistantMessageList.tsx
    - app/src/components/assistant/AssistantActionCard.tsx
    - app/src/components/assistant/AssistantActionCard.test.tsx
    - app/src/components/assistant/AssistantContextPanel.tsx
    - app/src/components/assistant/AssistantContextPanelSlot.tsx
    - app/src/lib/assistant/contract-display.ts
    - app/src/lib/assistant/contract-display.test.ts
  modified:
    - app/src/components/assistant/AssistantMain.tsx
    - app/src/lib/hooks/use-assistant-chat.ts
    - app/src/lib/hooks/use-assistant-threads.ts
    - app/src/app/(dashboard)/assistant/layout.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json

key-decisions:
  - "AssistantChatCore merges persisted thread messages with live hook state to avoid duplicate assistant bubbles after invalidation"
  - "Context panel reads action_card payloads only — no server contract import on client (D-context-panel)"
  - "Plain-text rendering for assistant messages; no dangerouslySetInnerHTML (T-181-09)"

patterns-established:
  - "Pattern: AssistantContextPanelSlot reads threadId from URL searchParams for layout slot"
  - "Pattern: contract-display.ts mirrors server display shape as client-safe parsers"

requirements-completed: [CHAT-01, CHAT-02]

duration: 22min
completed: 2026-06-25
---

# Phase 181 Plan 04: Chat Center + Context Panel Summary

**SSE streaming chat core with inline contract action cards, confirm/cancel mutations, and contextual right panel on the full /assistant page**

## Performance

- **Duration:** 22 min
- **Started:** 2026-06-25T21:17:00Z
- **Completed:** 2026-06-25T21:39:00Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Shared `AssistantChatCore` renders history, streams text_delta, gates input on threadId
- Inline action cards show risk label, credit impact, risk copy, confirmation policy with confirm/cancel
- Context panel surfaces contract readiness hints, pending suggested actions, and running job status
- Full three-column assistant page wired: tree sidebar + chat + context panel

## Task Commits

1. **Task 1: AssistantChatCore with message list and input** - `6a37b827` (test), `243b6cdf` (feat)
2. **Task 2: Inline action cards with confirm/cancel** - `30ca0daf` (test), `e2416699` (feat)
3. **Task 3: Context panel and full page composition** - `563a47ad` (feat)

## Files Created/Modified

- `app/src/components/assistant/AssistantChatCore.tsx` - Shared chat surface merging thread history + live SSE
- `app/src/components/assistant/AssistantActionCard.tsx` - Inline cards with contract metadata and mutations
- `app/src/components/assistant/AssistantContextPanel.tsx` - Right panel contract/job context
- `app/src/lib/assistant/contract-display.ts` - Client-safe display parsers
- `app/src/lib/hooks/use-assistant-threads.ts` - pollWhileActive refetch for active cards
- `app/src/lib/hooks/use-assistant-chat.ts` - tool_summary SSE handling

## Decisions Made

- Merged server messages with live hook messages to handle streaming without losing persisted history
- Reused `assistant.actionCard.status.*` keys in context panel for consistent status labels
- Polling enabled via `useAssistantThread(threadId, { pollWhileActive: true })` in chat and context

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added tool_summary handling in useAssistantChat**
- **Found during:** Task 1 (AssistantChatCore message rendering)
- **Issue:** Hook did not handle `tool_summary` SSE events required for compact tool line display
- **Fix:** Append tool messages from SSE frames with toolName + summary payload
- **Files modified:** `app/src/lib/hooks/use-assistant-chat.ts`
- **Committed in:** `243b6cdf`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for tool_summary behavior in chat; no scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `AssistantChatCore` ready for campaign drawer reuse in Plan 05 (CHAT-04)
- Chat + context panel functional against existing APIs; drawer integration is next

## Self-Check: PASSED

- FOUND: app/src/components/assistant/AssistantChatCore.tsx
- FOUND: app/src/components/assistant/AssistantActionCard.tsx
- FOUND: app/src/components/assistant/AssistantContextPanel.tsx
- FOUND: app/src/lib/assistant/contract-display.ts
- FOUND: 6a37b827, 243b6cdf, 30ca0daf, e2416699, 563a47ad

---
*Phase: 181-assistant-surface*
*Completed: 2026-06-25*
