---
phase: 181-assistant-surface
plan: 01
subsystem: api
tags: [react-query, sse, assistant, hooks, vitest]

requires:
  - phase: 178-conversation-persistence
    provides: Thread/message REST APIs and SSE wire format
  - phase: 180-action-contracts
    provides: Action card payloads and confirm/cancel routes
provides:
  - Hand-rolled SSE parser matching encodeAssistantSseEvent
  - useAssistantThreads, useAssistantThread, useCreateAssistantThread hooks
  - useAssistantChat streaming hook with AbortController
  - useConfirmAssistantAction and useCancelAssistantAction mutations
affects:
  - 181-02-assistant-shell
  - 181-03-chat-core
  - 181-04-campaign-drawer

tech-stack:
  added: []
  patterns:
    - "TanStack Query keys under assistant/threads and assistant/thread"
    - "fetch + ReadableStream SSE parsing (no EventSource)"
    - "campaignId=null query sentinel for client-level thread lists"

key-files:
  created:
    - app/src/lib/assistant/parse-sse.ts
    - app/src/lib/assistant/parse-sse.test.ts
    - app/src/lib/hooks/use-assistant-threads.ts
    - app/src/lib/hooks/use-assistant-threads.test.tsx
    - app/src/lib/hooks/use-assistant-chat.ts
    - app/src/lib/hooks/use-assistant-chat.test.tsx
    - app/src/lib/hooks/use-assistant-actions.ts
    - app/src/lib/hooks/use-assistant-actions.test.tsx
  modified:
    - app/src/app/api/assistant/threads/route.ts

key-decisions:
  - "Use campaignId=null URL sentinel on threads GET to filter client-level threads without a new API"
  - "Chat streaming uses fetch credentials:include and readAssistantSseStream, not EventSource"
  - "Strip reasoning/thinking in SSE parser per AI-05 before UI state"

patterns-established:
  - "Assistant hooks share query keys exported from use-assistant-threads"
  - "Action mutations accept threadId in mutate payload for targeted invalidation"

requirements-completed: [CHAT-02, CHAT-03, CHAT-04]

duration: 12min
completed: 2026-06-25
---

# Phase 181 Plan 01: Assistant Client Data Layer Summary

**Shared assistant client layer: hand-rolled SSE parser, thread CRUD hooks, streaming chat hook, and confirm/cancel action mutations with 26 passing unit tests**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-25T18:10:00Z
- **Completed:** 2026-06-25T18:12:20Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- SSE parser round-trips all five `ASSISTANT_SSE_EVENTS` with multi-chunk reassembly and abort support
- Thread list/detail/create hooks follow `apiFetch` + TanStack Query conventions with `campaignId=null` client-level filtering
- `useAssistantChat` accumulates `text_delta`, upserts `action_card` by `actionRecordId`, invalidates thread on `done`
- Confirm/cancel action hooks POST authenticated mutations and invalidate thread queries

## Task Commits

Each task was committed atomically (TDD test → feat):

1. **Task 1: SSE frame parser** - `6497d64d` (test), `b2993954` (feat)
2. **Task 2: Thread hooks** - `d6376b68` (test), `681af2a5` (feat)
3. **Task 3: Chat stream + action hooks** - `ee137524` (test), `39406dfb` (feat)

## Files Created/Modified

- `app/src/lib/assistant/parse-sse.ts` - `parseAssistantSseFrame` and `readAssistantSseStream` async generator
- `app/src/lib/hooks/use-assistant-threads.ts` - Thread list, detail, and create hooks
- `app/src/lib/hooks/use-assistant-chat.ts` - Streaming sendMessage with local message state
- `app/src/lib/hooks/use-assistant-actions.ts` - Confirm/cancel mutations
- `app/src/app/api/assistant/threads/route.ts` - Accept `campaignId=null` sentinel on GET

## Decisions Made

- Used `campaignId=null` query string sentinel (per RESEARCH Pattern 4) instead of omitting param, which would return all profile threads mixed with campaign threads
- Chat hook uses raw `fetch` with `credentials: "include"` for SSE body (apiFetch timeout unsuitable for streams)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Threads GET accepts campaignId=null sentinel**
- **Found during:** Task 2 (useAssistantThreads URL construction)
- **Issue:** Repository supports `campaignId === null` filter but GET route only accepted UUID or omitted param
- **Fix:** Parse `campaignId=null` string as client-level filter before calling `listAssistantThreads`
- **Files modified:** `app/src/app/api/assistant/threads/route.ts`
- **Verification:** `use-assistant-threads.test.tsx` passes null sentinel URL assertion
- **Committed in:** `681af2a5`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for correct client-level thread tree; minimal API surface change aligned with RESEARCH.

## Issues Encountered

- Vitest requires `--config config/vitest.config.ts` for `@/` alias resolution in lib tests (plan verify command used unsupported `-x` flag)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI plans (181-02+) can import hooks without duplicating SSE or fetch logic
- CHAT-02/03/04 data prerequisites available for assistant shell and chat core

## Self-Check: PASSED

- FOUND: app/src/lib/assistant/parse-sse.ts
- FOUND: app/src/lib/hooks/use-assistant-threads.ts
- FOUND: app/src/lib/hooks/use-assistant-chat.ts
- FOUND: app/src/lib/hooks/use-assistant-actions.ts
- FOUND: 6497d64d, b2993954, d6376b68, 681af2a5, ee137524, 39406dfb

---
*Phase: 181-assistant-surface*
*Completed: 2026-06-25*
