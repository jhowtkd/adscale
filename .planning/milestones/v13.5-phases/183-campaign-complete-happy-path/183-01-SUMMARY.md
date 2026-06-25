---
phase: 183-campaign-complete-happy-path
plan: 01
subsystem: assistant
tags: [assistant, campaign, ACT-05, EXEC-04]

provides:
  - start_complete_campaign executor queuing preview derivation
  - assistantActionId on Inngest events for campaign preview path

key-files:
  created:
    - app/src/server/assistant/action-execution/handlers/start-complete-campaign.ts
  modified:
    - app/src/server/assistant/action-execution/execute.ts

requirements-completed: [ACT-05]
---

# Summary 183-01: start_complete_campaign executor

Handler validates campaign thread context, queues preview derivation via existing pipeline, and attaches `assistantActionId` for async status sync.

**Verify:** `execute.test.ts` + handler unit coverage green.
