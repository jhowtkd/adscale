---
phase: 178-conversation-persistence
verified: 2026-06-25T20:31:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 178: Conversation Persistence Verification Report

**Phase Goal:** Persist assistant threads, messages, and action records with workspace/client/campaign scoping and job status support.

**Verified:** 2026-06-25T20:31:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Server can create and retrieve threads scoped by workspace, client profile, and campaign | ✓ VERIFIED | `assistant-thread.ts` exports `createAssistantThread`, `listAssistantThreads`, `getAssistantThreadById`; REST `GET/POST /api/assistant/threads` wired |
| 2 | Messages preserve user, assistant, tool, and action-card history without storing provider reasoning/thinking | ✓ VERIFIED | `MessageType` union + `PERSISTENCE_DENYLIST` in `assistant-types.ts`; `createAssistantMessage` rejects denied keys |
| 3 | Action records support pending, confirmed, running, completed, failed, and canceled states | ✓ VERIFIED | `ActionStatus` type + `ACTION_TRANSITIONS` + `transitionAssistantAction` in `assistant-action.ts` |
| 4 | Long-running jobs can update or be reflected in the related assistant action status | ✓ VERIFIED | `syncAssistantActionFromJob` + `derivationJob` calls in mark-processing/completed/failed/onFailure when `assistantActionId` present |
| 5 | PostgreSQL has normalized assistant_threads, assistant_messages, assistant_action_records tables | ✓ VERIFIED | `0057_assistant_conversation.sql` + Drizzle definitions in `schema.ts` lines 2126–2225 |
| 6 | Assistant tables enforce workspaceId + clientProfileId scoping at schema level | ✓ VERIFIED | All three tables have `workspace_id` NOT NULL FK; threads have `client_profile_id` NOT NULL FK |
| 7 | Shared TypeScript contracts define message types, action lifecycle, sanitized payloads | ✓ VERIFIED | `assistant-types.ts` exports `MessageType`, `ActionStatus`, `JobRef`, `PERSISTENCE_DENYLIST` |
| 8 | Server can create client-level threads (campaignId null) scoped by workspace + clientProfileId | ✓ VERIFIED | `createAssistantThread` validates profile via `getClientProfile`; tests in `assistant-thread.test.ts` |
| 9 | Multiple campaign threads with deterministic default thread resolution | ✓ VERIFIED | `getOrCreateDefaultCampaignThread` + partial unique index `assistant_threads_campaign_default_uidx` |
| 10 | Client thread can be linked to campaign via FK update without losing message history | ✓ VERIFIED | `linkThreadToCampaign` sets `campaignId` + `migratedFromThreadId`; messages remain on same thread |
| 11 | Cross-workspace thread access returns null (404 at API layer) | ✓ VERIFIED | `getAssistantThreadById` filters by workspaceId; route test asserts 404 when null |
| 12 | Messages append to chronological stream ordered by sequence | ✓ VERIFIED | `createAssistantMessage` uses `MAX(sequence)+1`; `listAssistantMessages` orders ASC |
| 13 | Tool messages persist only toolName + sanitized summary | ✓ VERIFIED | `validatePayload` requires toolName/summary, rejects rawArgs |
| 14 | Action cards linked 1:1 to action records with pending immutability | ✓ VERIFIED | `createAssistantAction` transaction creates message + record; pending inputSnapshot immutable |
| 15 | Failed/canceled actions update action_card payload in-place with safe error | ✓ VERIFIED | `transitionAssistantAction` calls `updateActionCardPayload` + `sanitizeSafeError` |
| 16 | REST API creates/lists threads, reads thread+messages, appends messages, confirm/cancel actions | ✓ VERIFIED | 7 route files under `/api/assistant/` with auth + repository wiring |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/drizzle/0057_assistant_conversation.sql` | Migration for 3 assistant tables | ✓ VERIFIED | Creates threads, messages, action_records with FKs and indexes |
| `app/drizzle/meta/_journal.json` | Migration 0057 registered | ✓ VERIFIED | idx 56, tag `0057_assistant_conversation` |
| `app/src/server/db/schema.ts` | Drizzle assistant_* tables | ✓ VERIFIED | `assistantThreads`, `assistantMessages`, `assistantActionRecords` |
| `app/src/server/repositories/assistant-types.ts` | Shared contracts | ✓ VERIFIED | 85 lines, all planned exports |
| `app/src/server/repositories/assistant-thread.ts` | Thread CRUD + default + link | ✓ VERIFIED | 216 lines, wired to client-reference |
| `app/src/server/repositories/assistant-message.ts` | Message stream + sanitization | ✓ VERIFIED | Sequence ordering, denylist guard |
| `app/src/server/repositories/assistant-action.ts` | Action lifecycle | ✓ VERIFIED | Full transition graph + card sync |
| `app/src/server/repositories/assistant-job-sync.ts` | Job→action sync helper | ✓ VERIFIED | Maps processing/completed/failed → action status |
| `app/src/server/jobs/derivation.ts` | Optional assistantActionId sync | ✓ VERIFIED | Sync in mark-processing, mark-completed, onFailure |
| `app/src/app/api/assistant/**` | REST routes | ✓ VERIFIED | threads, messages, link-campaign, confirm, cancel |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `schema.ts` | `client_profiles` | clientProfileId FK | ✓ WIRED | `.references(() => clientProfiles.id)` |
| `schema.ts` | `campaigns` | optional campaignId FK | ✓ WIRED | Nullable FK on threads |
| `assistant-thread.ts` | `client-reference.ts` | getClientProfile | ✓ WIRED | Validation on create |
| `assistant-action.ts` | `assistant-message.ts` | updateActionCardPayload | ✓ WIRED | Called on every transition |
| `assistant-message.ts` | `assistant-types.ts` | PERSISTENCE_DENYLIST | ✓ WIRED | `containsDeniedPersistenceKeys` |
| `derivation.ts` | `assistant-job-sync.ts` | syncAssistantActionFromJob | ✓ WIRED | gsd-tools key-link verified |
| `threads/[threadId]/route.ts` | `assistant-message.ts` | listAssistantMessages | ✓ WIRED | gsd-tools key-link verified |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `GET threads/[threadId]` | `messages` | `listAssistantMessages(workspace.id, threadId)` | DB query with workspace+thread filter | ✓ FLOWING |
| `POST threads/[threadId]/messages` | `message` | `createAssistantMessage` → INSERT | Monotonic sequence insert | ✓ FLOWING |
| `derivationJob` sync | action status | `syncAssistantActionFromJob` → `transitionAssistantAction` | Updates action record + action_card payload | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Repository unit tests | `npm test -- assistant-thread.test.ts assistant-message.test.ts assistant-action.test.ts assistant-job-sync.test.ts` | 17 passed | ✓ PASS |
| derivationJob assistant sync | `npm test -- derivation.test.ts -t "assistant action sync"` | 2 passed (within 43 total) | ✓ PASS |
| Thread detail route | `npm test -- route.test.ts` | 2 passed | ✓ PASS |
| Full assistant test suite | `npm test --` (6 assistant test files) | 43 passed, 6 files | ✓ PASS |
| Migration journal | `0057` in `_journal.json` | Present at idx 56 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| EXEC-02 | 178-01 through 178-04 | Long-running actions use existing pipeline/Inngest job behavior and show status in the assistant thread | ✓ SATISFIED | `jobRefs` on action records; `syncAssistantActionFromJob` wired into `derivationJob`; action_card payload updated on status change; GET thread returns persisted status in message payload |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found | — | — |

No TODO/FIXME/placeholder stubs in assistant repositories or API routes.

### Deferred Items (Out of Scope — Later Phases)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Real-time UI status display in assistant surface | Phase 181 | ROADMAP SC: "Campaign workspace drawer opens and continues the same campaign thread"; CONTEXT: "UI de status em tempo real fica para fases posteriores" |
| 2 | Assistant orchestration / streaming / tool policy | Phase 179 | ROADMAP goal: Model Adapter and Tool Policy |
| 3 | Action card confirmation UX in chat | Phase 180 | ROADMAP goal: Action Contracts (EXEC-01) |

These are intentional scope boundaries, not gaps in Phase 178.

### Human Verification Required

None. Phase 178 delivers backend persistence and REST APIs; behavioral coverage is provided by 43 passing unit/route tests. Live Inngest E2E and UI rendering are explicitly deferred to later phases.

### Gaps Summary

No gaps found. All roadmap success criteria, plan must-haves, and EXEC-02 requirement are satisfied in the codebase with substantive implementations (not stubs), correct wiring, and passing tests.

---

_Verified: 2026-06-25T20:31:00Z_  
_Verifier: Claude (gsd-verifier)_
