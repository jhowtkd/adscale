---
phase: 205-creative-iteration-loop
plan: "03"
subsystem: api
tags: [inngest, action-contracts, creative-revision, refund, idempotency, zod]

# Dependency graph
requires:
  - phase: 205-creative-iteration-loop (Plans 01 & 02)
    provides: confirmCreativeRevision, refundCredits, revise_creative_plan contract, assistant_action_card UI
  - phase: 204-plan-iteration-loop
    provides: confirmPlanRevision pattern (idempotent confirm), revise_creative_plan handler
  - phase: 203-artifact-version-foundation
    provides: createArtifactVersion, updateArtifactHead, listArtifactVersions, getArtifactLineage, getArtifactHead
provides:
  - revise_creative action contract with planVersionId input requirement
  - executeReviseCreative handler (charge → confirm → enqueue → async)
  - Deterministic retry idempotency keys (jobRefs.length, never Date.now())
  - Derivation success callback creates creative version + updates working head
  - Derivation failure callback refunds 5 credits (image_derivation)
  - cancelRunningCreativeRevision helper (action + derivation → canceled)
  - ACTION_TRANSITIONS allows failed → confirmed (enables retry on same action record)
affects:
  - 205-04 orchestrator + service facade (uses revise_creative contract + handler)
  - Phase 206 promotion (reads creative versions created by this plan)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN with mixed commit strategy: Task 1 = test stubs only (RED); Tasks 2-3 = full test+feat atomic commits"
    - "Deterministic idempotency key from action.jobRefs.length (no wall-clock)"
    - "Status-gate before side effects: cancel/failed actions skip version creation"
    - "Swallow refund errors in onFailure so failure cleanup is never blocked"
    - "Mirror existing quick_restyle pattern (charge→enqueue→async) with creative-iteration confirm step"

key-files:
  created:
    - app/src/server/assistant/action-contracts/contracts/revise-creative.ts
    - app/src/server/assistant/action-execution/handlers/revise-creative.ts
  modified:
    - app/src/server/assistant/action-contracts/contracts/index.ts (register reviseCreativeContract)
    - app/src/server/assistant/action-execution/handlers/revise-creative.test.ts (contract + handler tests, 16 tests)
    - app/src/server/assistant/action-execution/execute.ts (wire revise_creative handler in HANDLERS)
    - app/src/server/assistant/creative-iteration/proposal.ts (add cancelRunningCreativeRevision helper)
    - app/src/server/jobs/derivation.ts (success callback + failure refund + cancel imports)
    - app/src/server/jobs/derivation.test.ts (10 new creative revision callback tests)
    - app/src/server/assistant/action-contracts/validate.ts (allow failed status in revalidateOnConfirm)
    - app/src/server/repositories/assistant-types.ts (allow failed → confirmed in ACTION_TRANSITIONS)

key-decisions:
  - "retry idempotency key = 'assistant-action:{actionId}:creative_revision:retry:{attemptIndex}' where attemptIndex = action.jobRefs.length (deterministic, replayable)"
  - "Deviation [Rule 3 - Blocking]: added failed → confirmed transition (was terminal) — required for CONTEXT.md's retry-on-same-action-record requirement"
  - "Deviation [Rule 3 - Blocking]: revalidateOnConfirm now allows 'failed' status in addition to 'pending' — required for retry button to work"
  - "Status gate in success callback: skip createArtifactVersion AND updateArtifactHead when action.status in {canceled, failed}"
  - "cancelRunningCreativeRevision: transitions BOTH action AND derivation to 'canceled' — no refund issued (user-initiated, not job failure)"
  - "Refund idempotency key: 'assistant-action:{actionId}:refund' — distinct from charge key so retry-after-failure can re-charge"
  - "Refund errors swallowed with logger.error (failure cleanup must not be blocked by refund failures)"
  - "Working head updated, NOT approvedCurrentVersionId — promotion is Phase 206"
  - "Empty assistant-action context (e.g., quick_restyle) does NOT trigger creative revision code path — gated on generationMode === 'creative_revision'"

patterns-established:
  - "Pattern: deterministic retry key from jobRefs.length — never use Date.now() for idempotency keys on retry-prone operations"
  - "Pattern: status-gated side effects — always check action.status before writing to artifact-version or refunding; 'canceled' and 'failed' both suppress version creation"
  - "Pattern: cancel hook for in-flight generation — when user cancels a running action, mark BOTH action AND derivation as canceled so the async callback observes cancellation"
  - "Pattern: dual-callback idempotency — check listArtifactVersions for existing provenance.actionId before creating new version (handles double-callback)"
  - "Pattern: refund-as-reverse-spend — same idempotency-key shape as charge but with explicit ':refund' suffix for distinct deduplication"

requirements-completed: [CREV-03, SAFE-02]

# Metrics
duration: 8min
completed: 2026-06-28
---
# Phase 205 Plan 03: revise_creative Handler + Derivation Callbacks Summary

**revise_creative action contract + charge→confirm→enqueue handler with deterministic retry keys + derivation callbacks that create creative version on success and refund credits on failure**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-28T00:46:18Z
- **Completed:** 2026-06-28T00:54:09Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `reviseCreativeContract` registered with `planVersionId` as required input, `creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" }`, `riskLabel: medium`, `confirmationPolicy: required`
- `executeReviseCreative` handler charges 5 credits via `spendCreditsOrApiError` with deterministic per-attempt idempotency key, confirms proposal via `confirmCreativeRevision`, creates derivation with `generationMode: "creative_revision"`, enqueues `derivation.generate` Inngest event with `assistantActionId` and `planVersionId`, returns async mode
- Derivation success callback creates child creative version (snapshot includes `planVersionId`, `derivationId`, `outputKey`, `format`, `generationMode`, `ctaText`) and updates working head (NOT approved) — gated on `action.status !== "canceled" | "failed"`
- Derivation failure callback calls `refundCredits` with `image_derivation`, idempotency key `assistant-action:{actionId}:refund`, amount 5 — non-creative-revision jobs unaffected
- `cancelRunningCreativeRevision` helper transitions BOTH action AND derivation to `canceled` so async callbacks observe the cancellation
- 16 handler tests + 10 derivation callback tests + 5 contract tests all green
- Production build passes (TypeScript compiles)

## Task Commits

Each task was committed atomically (RED+GREEN where TDD):

1. **Task 1: revise_creative contract + handler test stubs** — `286af856` (test)
2. **Task 2: executeReviseCreative handler** — `861b3fce` (feat, includes [Rule 3] transition table fix)
3. **Task 3: Derivation job callbacks + cancel hook** — `f80e7bff` (feat)
4. **Lint fix: type-safe onFailure accessor** — `52a5f054` (refactor)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `app/src/server/assistant/action-contracts/contracts/revise-creative.ts` — new contract with `planVersionId` required, `image_derivation` credit action
- `app/src/server/assistant/action-execution/handlers/revise-creative.ts` — new handler with charge → confirm → enqueue → async flow
- `app/src/server/assistant/action-contracts/contracts/index.ts` — registered `reviseCreativeContract` after `reviseCreativePlanContract`
- `app/src/server/assistant/action-execution/execute.ts` — added `revise_creative: executeReviseCreative` to HANDLERS map
- `app/src/server/assistant/action-execution/handlers/revise-creative.test.ts` — 16 tests covering contract, schema validation, charge, enqueue, async, idempotent, retry, credit_blocked, one-active, inngest.send failure
- `app/src/server/assistant/creative-iteration/proposal.ts` — added `cancelRunningCreativeRevision` helper that transitions BOTH action status and derivation status to canceled
- `app/src/server/jobs/derivation.ts` — added `create-creative-version` step (gated on status + creative_revision mode) and `refund-creative-revision` step (gated on creative_revision mode) in onFailure
- `app/src/server/jobs/derivation.test.ts` — added 10 creative revision callback tests (success with version creation, success skipped on cancel/fail, idempotent on duplicate callback, non-creative modes unaffected, refund on creative_revision failure, no refund for non-creative modes, no refund when no assistantActionId, refund errors swallowed)
- `app/src/server/assistant/action-contracts/validate.ts` — `revalidateOnConfirm` now allows `failed` status (retry support)
- `app/src/server/repositories/assistant-types.ts` — `ACTION_TRANSITIONS` allows `failed → confirmed` (retry support)

## Decisions Made

- **Retry idempotency key pattern**: `assistant-action:{actionId}:creative_revision:retry:{attemptIndex}` where `attemptIndex = action.jobRefs.length`. This is deterministic across replays (no `Date.now()`), so retries on the same action record produce stable, reproducible keys.
- **Status gate is the source of truth for "canceled"**: success callback reads `action.status` from the database (NOT derivation status) because the cancel mutation sets action.status to `canceled` first, then derivation. The success callback fetches the freshest action state at execution time.
- **Cancel hook pattern**: `cancelRunningCreativeRevision` must update BOTH action AND derivation. If only derivation is canceled, the action would still be `running` and Inngest would not retry. If only action is canceled, the derivation would still be `processing` and the success callback's status check would still skip — but for symmetry and clarity, both are updated atomically.
- **Refund on failure is gated on `generationMode === "creative_revision"`**: existing flows (`quick_restyle`, `quick_regenerate`, etc.) charge via their API routes and have no refund. This plan only adds refund for creative revisions to maintain backward compatibility.
- **`approvedCurrentVersionId` unchanged**: Phase 205 does NOT promote new versions to "approved" status — that's Phase 206. The success callback only updates `workingVersionId`.
- **Empty assistant-action context (no `assistantActionId`) does NOT trigger creative_revision code path**: `if (assistantActionId && effectiveGenerationMode === "creative_revision")` ensures we don't break existing non-assistant-action flows like `quick_restyle`, `quick_regenerate`, etc.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `failed → confirmed` transition to ACTION_TRANSITIONS**
- **Found during:** Task 2 (handler implementation for retry)
- **Issue:** CONTEXT.md mandates "Retry on failed action charges again on same action record with new attempt key" but `ACTION_TRANSITIONS` had `failed: []` (terminal). Without this transition, the existing "Tentar novamente" button on `AssistantActionCard` would throw `InvalidActionTransitionError` when clicked.
- **Fix:** Added `failed: ["confirmed"]` to the transition table. This allows the confirm route to transition a failed action back to `confirmed`, then `executeConfirmedAssistantAction` transitions it to `running`.
- **Files modified:** `app/src/server/repositories/assistant-types.ts`
- **Verification:** All existing tests pass; new handler retry test (`retry charges again with deterministic per-attempt key`) passes
- **Committed in:** `861b3fce` (Task 2 commit)

**2. [Rule 3 - Blocking] `revalidateOnConfirm` now allows `failed` status**
- **Found during:** Task 2 (handler implementation for retry)
- **Issue:** `revalidateOnConfirm` had `if (action.status !== "pending")` check. Once an action transitioned to `failed`, retry would fail at validation BEFORE even reaching the transition. Required fix #1 to be complete.
- **Fix:** Changed check to `if (action.status !== "pending" && action.status !== "failed")`. This allows retry of `failed` actions through the confirm flow.
- **Files modified:** `app/src/server/assistant/action-contracts/validate.ts`
- **Verification:** All existing `revalidateOnConfirm` tests pass; new handler retry test passes
- **Committed in:** `861b3fce` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added `db.insert` mock to `derivation.test.ts`**
- **Found during:** Task 3 (creative revision success callback tests)
- **Issue:** The mock for `../db` only had `select` and `update` methods. When the success callback runs, it triggers `createNotification` which calls `db.insert(...).values(...).returning(...)` — failing with `db.insert is not a function`.
- **Fix:** Added `insert` chain to the `db` mock. Also added `createNotification` mock as a simpler alternative since the test doesn't assert on notification side effects.
- **Files modified:** `app/src/server/jobs/derivation.test.ts`
- **Verification:** All creative revision callback tests pass
- **Committed in:** `f80e7bff` (Task 3 commit)

**4. [Rule 1 - Bug] Inngest mock did not store `opts.onFailure`**
- **Found during:** Task 3 (creative revision failure callback tests)
- **Issue:** The inngest mock returned `{ fn: handler }` but discarded the `opts` argument. The failure callback tests need to access `opts.onFailure` directly. Without storing opts, all 4 onFailure tests failed with `TypeError: Cannot read properties of undefined (reading 'onFailure')`.
- **Fix:** Changed mock to return `{ opts, fn: handler }` so tests can access `onFailure` directly. This also follows the actual inngest API where `opts.onFailure` is a registered callback.
- **Files modified:** `app/src/server/jobs/derivation.test.ts`
- **Verification:** All 4 onFailure tests pass
- **Committed in:** `f80e7bff` (Task 3 commit)

**5. [Rule 2 - Missing Critical] Type-safe `onFailure` accessor (lint)**
- **Found during:** Task 3 (lint check after commit)
- **Issue:** Lint flagged the `Function` type used to type the `onFailure` callback (4 instances). `@typescript-eslint/no-unsafe-function-type` rule prefers explicit signatures.
- **Fix:** Replaced `(opts: { onFailure: Function })` with `(...args: unknown[]) => Promise<unknown>` to satisfy the rule and be more explicit about the unsafe boundary.
- **Files modified:** `app/src/server/jobs/derivation.test.ts`
- **Verification:** Lint passes; all tests still pass
- **Committed in:** `52a5f054` (separate refactor commit)

---

**Total deviations:** 5 auto-fixed (1 bug, 3 blocking/missing-critical, 1 lint hygiene)
**Impact on plan:** All deviations necessary for the retry flow (the headline SAFE-02 invariant) and for test correctness. No scope creep beyond the plan's stated requirements.

## Issues Encountered

- **Existing plan 04 work in branch**: The branch already contained commits from a previous execution of Plan 04 (service facade, orchestrator wiring, draft API route, intent classifier tests). I left those untouched and only worked on Plan 03 files. This is not an issue per se — it's just context about the branch state.
- **`function generateRetryKey` placement**: Initial implementation of the handler tried to compute attempt index from `ctx.inputSnapshot.__retryAttemptIndex`, but the executor context doesn't inject this. Resolved by reading `action.jobRefs.length` from the database inside the handler — more robust because it survives context loss across retries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `executeReviseCreative` is wired into `execute.ts` and ready for the orchestrator (Plan 04 already wired it)
- Derivation job handles `creative_revision` mode for both success (version creation + head update) and failure (credit refund)
- `cancelRunningCreativeRevision` is ready to be wired into `useCancelAssistantAction` mutation (Plan 04 / Plan 05)
- Phase 206 can read the creative versions created here and implement promotion (`approvedCurrentVersionId` update)

---
*Phase: 205-creative-iteration-loop*
*Completed: 2026-06-28*

## Self-Check: PASSED

- FOUND: app/src/server/assistant/action-contracts/contracts/revise-creative.ts
- FOUND: app/src/server/assistant/action-execution/handlers/revise-creative.ts
- FOUND: app/src/server/assistant/action-execution/handlers/revise-creative.test.ts
- FOUND: 286af856 (Task 1 commit)
- FOUND: 861b3fce (Task 2 commit)
- FOUND: f80e7bff (Task 3 commit)
- FOUND: 52a5f054 (lint fix)
- VERIFIED: 50 tests pass (16 handler + 34 derivation)
- VERIFIED: TypeScript compiles
- VERIFIED: Lint passes (no errors)
