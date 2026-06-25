---
phase: 178-conversation-persistence
plan: 01
subsystem: database
tags: [drizzle, postgres, assistant, schema]

requires:
  - phase: 177-multi-client-foundation
    provides: multi clientProfileId isolation patterns
provides:
  - assistant_threads, assistant_messages, assistant_action_records Drizzle tables
  - Shared assistant type contracts and ACTION_TRANSITIONS map
affects: [178-02, 178-03, 178-04, 179, 180, 181]

tech-stack:
  added: []
  patterns:
    - "Workspace-scoped assistant tables with denormalized workspaceId on messages"
    - "Partial unique index for campaign default threads"

key-files:
  created:
    - app/src/server/repositories/assistant-types.ts
    - app/drizzle/0057_assistant_conversation.sql
  modified:
    - app/src/server/db/schema.ts
    - app/drizzle/meta/_journal.json

key-decisions:
  - "isDefault boolean + partial unique index for deterministic campaign default thread"
  - "Circular message/action FK handled in SQL migration; Drizzle uses messageId FK on action records"

patterns-established:
  - "PERSISTENCE_DENYLIST enforced at type layer for downstream repositories"

requirements-completed: [EXEC-02]

duration: 25min
completed: 2026-06-25
---

# Phase 178 Plan 01: Schema Foundation Summary

**Drizzle schema and migration 0057 for assistant threads, messages, and action records with shared type contracts**

## Performance

- **Duration:** 25 min
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Exported MessageType, ActionStatus, JobRef, payload interfaces, ACTION_TRANSITIONS, PERSISTENCE_DENYLIST
- Added three assistant tables with workspace/profile FKs and indexes
- Registered migration 0057 in drizzle journal

## Task Commits

1. **Define assistant type contracts** - `887e2b66` (feat)
2. **Add Drizzle schema and migration 0057** - `96df4a99` (feat)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Self-Check: PASSED

---
*Phase: 178-conversation-persistence*
*Completed: 2026-06-25*
