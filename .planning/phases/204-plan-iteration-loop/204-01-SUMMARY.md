---
phase: 204-plan-iteration-loop
plan: "01"
subsystem: api
tags: [openai, zod, drizzle, artifact-version, action-contracts, vitest]
requires:
  - phase: 203-artifact-version-foundation
    provides: artifact proposals, version creation, head CAS, plan snapshots
provides:
  - Server-owned semantic diff and proposal payload digest
  - Thread-scoped unsent feedback draft persistence
  - Plan revision proposal service with clarify/redirect/propose paths
  - revise_creative_plan zero-credit action contract and sync confirm handler
affects: [204-plan-iteration-loop-02, orchestrator-wiring, action-card-ui]
tech-stack:
  added: []
  patterns: [server-computed semantic changes, proposal digest confirm binding, injectable LLM snapshot generator in tests]
key-files:
  created:
    - app/drizzle/0065_assistant_plan_feedback_drafts.sql
    - app/src/server/assistant/plan-iteration/diff.ts
    - app/src/server/assistant/plan-iteration/digest.ts
    - app/src/server/assistant/plan-iteration/draft.ts
    - app/src/server/assistant/plan-iteration/proposal.ts
    - app/src/server/assistant/plan-iteration/intent.ts
    - app/src/server/assistant/action-contracts/contracts/revise-creative-plan.ts
    - app/src/server/assistant/action-execution/handlers/revise-creative-plan.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/repositories/artifact-version.ts
    - app/src/server/assistant/action-contracts/contracts/index.ts
    - app/src/server/assistant/action-execution/execute.ts
key-decisions:
  - "Semantic changes[] and neutral summaries are always computed server-side; LLM output is limited to snapshot fields."
  - "Confirmation binds proposalId, sourceVersionId, and payloadDigest; working head updates only on confirm."
  - "Plan revision intent classifier ignores unrelated chat unless short action-like feedback needs clarification."
patterns-established:
  - "canonicalProposalPayloadDigest uses stable JSON canonicalization for confirm-time replay checks."
  - "proposePlanRevision accepts generateRevisedPlanSnapshot injection for deterministic unit tests."
requirements-completed: [PLAN-01, PLAN-03, PLAN-04]
duration: 45min
completed: 2026-06-27
---

# Phase 204 Plan 01: Plan Revision Core Domain Summary

**Server-owned plan revision proposals with semantic diffing, thread drafts, zero-credit confirm binding, and sync child-version creation without touching approved current**

## Performance

- **Duration:** 45 min
- **Started:** 2026-06-27T18:58:00Z
- **Completed:** 2026-06-27T19:05:00Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- Pure `buildPlanSemanticChanges` and `canonicalProposalPayloadDigest` helpers with focused unit tests.
- Migration 0065 and scoped draft persistence for unsent thread feedback (max 2k chars, no proposals).
- `proposePlanRevision` / `resolvePlanRevisionSource` / `cancelPlanRevision` / `confirmPlanRevision` orchestrating Phase 203 primitives.
- `revise_creative_plan` action contract (0 credits) and sync handler wired into action execution.
- 35 automated tests green; production build passes.

## Task Commits

1. **Task 1: Semantic diff, payload digest, and draft persistence** - `076835a2` (feat)
2. **Task 2: Proposal service with source resolution and clarification** - `1360e599` (feat)
3. **Task 3: revise_creative_plan contract and confirm handler** - `256700ea` (feat)

## Files Created/Modified

- `app/src/server/assistant/plan-iteration/` — diff, digest, draft, proposal, intent modules and tests
- `app/drizzle/0065_assistant_plan_feedback_drafts.sql` — thread-scoped draft table
- `app/src/server/assistant/action-contracts/contracts/revise-creative-plan.ts` — zero-credit contract
- `app/src/server/assistant/action-execution/handlers/revise-creative-plan.ts` — sync confirm handler
- `app/src/server/repositories/artifact-version.ts` — `getArtifactProposal` lookup

## Decisions Made

- Injectable `generateRevisedPlanSnapshot` keeps proposal tests deterministic without live OpenAI.
- `confirmPlanRevision` idempotency keys on `provenance.actionId` to prevent duplicate child versions.
- Intent routing treats unrelated chat as `continue` unless short action-like tokens need clarification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added getArtifactProposal repository helper**
- **Found during:** Task 2 (confirmPlanRevision)
- **Issue:** Proposal confirm path needed scoped single-proposal fetch; only list existed
- **Fix:** Added `getArtifactProposal(scope, proposalId)`
- **Files modified:** `app/src/server/repositories/artifact-version.ts`
- **Committed in:** `256700ea`

**2. [Rule 3 - Blocking] Fixed duplicate module imports**
- **Found during:** Task 3 verification (build)
- **Issue:** Duplicate `reviseCreativePlanContract` and `executeReviseCreativePlan` imports broke compile
- **Fix:** Deduplicated imports in contracts index and execute map
- **Files modified:** `contracts/index.ts`, `action-execution/execute.ts`
- **Committed in:** `256700ea`

**3. [Rule 1 - Bug] Exported PlanVersionSnapshot via z.infer**
- **Found during:** Task 3 verification (TypeScript)
- **Issue:** `PlanVersionSnapshot` type not exported from shared artifact-version lib
- **Fix:** Defined exported type in `plan-iteration/types.ts`; parse proposed snapshots with Zod
- **Files modified:** `types.ts`, `diff.ts`, `proposal.ts`
- **Committed in:** `256700ea`

**4. [Rule 3 - Blocking] Intent classifier unrelated-chat false positive**
- **Found during:** Task 3 test run
- **Issue:** `classifyPlanRevisionIntent("obrigado")` returned clarify via short-text heuristic
- **Fix:** Only classify clarify/out-of-scope when revise hints present; short action tokens without hints still clarify
- **Files modified:** `intent.ts`
- **Committed in:** `256700ea`

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All fixes required for correct confirm binding and green verification. No scope creep beyond core domain.

## Issues Encountered

Uncommitted Wave 2 files (orchestrator, action card UI, API routes) were present in the worktree from parallel planning; left untouched per scope boundary.

## User Setup Required

None — uses existing OpenAI and PostgreSQL configuration.

## Next Phase Readiness

Wave 2 can wire orchestrator routing, plan-revision API commands, action-card display, and `revalidateOnConfirm` against stable `proposePlanRevision` / `confirmPlanRevision` contracts.

---
*Phase: 204-plan-iteration-loop*
*Completed: 2026-06-27*

## Self-Check: PASSED

- FOUND: app/src/server/assistant/plan-iteration/proposal.ts
- FOUND: app/src/server/assistant/action-execution/handlers/revise-creative-plan.ts
- FOUND: app/drizzle/0065_assistant_plan_feedback_drafts.sql
- FOUND: 076835a2
- FOUND: 1360e599
- FOUND: 256700ea
