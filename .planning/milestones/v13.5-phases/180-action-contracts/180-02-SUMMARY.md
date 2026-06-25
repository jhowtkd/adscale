---
phase: 180-action-contracts
plan: 02
subsystem: api
tags: [assistant, intent-classification, orchestrator, vitest, heuristics]

requires:
  - phase: 178-conversation-persistence
    provides: orchestrator turn loop and message persistence
  - phase: 179-tool-policy
    provides: deny-by-default tool policy before propose_action
provides:
  - classifyUserIntent pure function with binary quick_action | complete_campaign taxonomy
  - buildIntentPromptAugment for system prompt hints and model fallback
  - orchestrator pre-stream hook with clarify short-circuit
affects: [180-03, 180-04, 181-assistant-surface]

tech-stack:
  added: []
  patterns:
    - "Server-side binary intent classification before model stream"
    - "Deterministic Portuguese clarify short-circuit without provider call"

key-files:
  created:
    - app/src/server/assistant/action-contracts/intent-classifier.ts
    - app/src/server/assistant/action-contracts/intent-classifier.test.ts
  modified:
    - app/src/server/assistant/orchestrator.ts
    - app/src/server/assistant/orchestrator.test.ts

key-decisions:
  - "Heuristic keywords per RESEARCH Pattern 2; dual-match returns fixed Portuguese clarify question"
  - "Skip path injects model fallback hint in systemPrompt; classified path injects intent family line"
  - "Clarify path persists assistant message and returns done without invoking modelClient.stream"

patterns-established:
  - "Pattern: classifyUserIntent after user message persist, before toAssistantModelRequest"
  - "Pattern: buildIntentPromptAugment augments request.systemPrompt with newline separator"

requirements-completed: [ACT-01]

duration: 5min
completed: 2026-06-25
---

# Phase 180 Plan 02: Intent Classification Summary

**Binary server-side intent classifier (`quick_action` | `complete_campaign`) wired into orchestrator with greeting skip, Portuguese clarify short-circuit, and system prompt augmentation.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-25T16:13:00Z
- **Completed:** 2026-06-25T16:18:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `classifyUserIntent()` pure function with greeting skip, keyword heuristics, and dual-match clarification
- `buildIntentPromptAugment()` returns intent family line for classified results and fallback hint for skip
- Orchestrator short-circuits ambiguous intent with persisted clarify message (no model stream)
- Classified intent augments `systemPrompt` before `modelClient.stream`
- Orchestrator fixture updated from `restyle` to `quick_restyle` with `baseCreativeId`

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement classifyUserIntent pure function** - `17123296` (test RED), `55350ab0` (feat GREEN)
2. **Task 2: Wire intent classification into orchestrator pre-stream** - `7e9b0c61` (test RED), `c52d4bf8` (feat GREEN)

**Plan metadata:** `1b319a35` (docs: complete plan)

## Files Created/Modified

- `app/src/server/assistant/action-contracts/intent-classifier.ts` - Pure classifier and prompt augment builder
- `app/src/server/assistant/action-contracts/intent-classifier.test.ts` - 9 unit tests for heuristics and augment shapes
- `app/src/server/assistant/orchestrator.ts` - Pre-stream intent hook with clarify short-circuit
- `app/src/server/assistant/orchestrator.test.ts` - Clarify, augment, greeting skip tests; quick_restyle fixture

## Decisions Made

- Followed RESEARCH Pattern 2 keyword lists exactly for quick/campaign/greeting heuristics
- Clarify question uses exact Portuguese string from CONTEXT: "Você quer uma ação pontual ou montar uma campanha completa?"
- Skip fallback hint appended via `buildIntentPromptAugment` per RESEARCH Q3 resolution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest `-x` flag unsupported in v4.1.5; verification used `--config config/vitest.config.ts` instead

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 180-03 can integrate contract registry validation in `propose_action` using intent family orientation already in system prompt
- Plan 180-01 (registry foundation) can run in parallel or before 180-03 if not yet executed

## Self-Check: PASSED

- FOUND: app/src/server/assistant/action-contracts/intent-classifier.ts
- FOUND: app/src/server/assistant/action-contracts/intent-classifier.test.ts
- FOUND: app/src/server/assistant/orchestrator.ts (modified)
- FOUND: 17123296, 55350ab0, 7e9b0c61, c52d4bf8

---
*Phase: 180-action-contracts*
*Completed: 2026-06-25*
