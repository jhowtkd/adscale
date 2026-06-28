---
phase: 205-creative-iteration-loop
verified: 2026-06-28T01:59:30Z
status: passed
score: 22/22 must-haves verified
---

# Phase 205: Creative Iteration Loop Verification Report

**Phase Goal:** Let users create recoverable creative revisions tied to exact source creative and plan versions.

**Verified:** 2026-06-28T01:59:30Z
**Status:** PASSED — all must-haves verified, all success criteria achieved, all 5 requirements delivered.

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Feedback on a selected creative creates a proposal describing intended visual change, format, references, writes, and credit impact. | ✅ VERIFIED | `app/src/server/assistant/creative-iteration/proposal.ts:308-321` builds payload with `intendedChanges`, `format`, `referenceIds`, `creditImpact`, `writes`, `planVersionId`. `service.ts:19-52` builds action display. `AssistantActionCard.tsx:186-240` renders all fields. `route.ts:30-76` persists draft. |
| 2 | Confirmed generation creates one child creative version linked to source creative and exact plan version. | ✅ VERIFIED | `app/src/server/assistant/action-execution/handlers/revise-creative.ts:96-120` enqueues derivation.generate with `planVersionId`. `derivation.ts:991-1015` calls `createArtifactVersion` with snapshot `planVersionId: input.planVersionId` and provenance `sourceVersionId`, `planVersionId`, `actionId`. |
| 3 | Duplicate confirmation, callback, or retry cannot duplicate charges, jobs, or versions. | ✅ VERIFIED | `proposal.ts:421-430` actionId idempotency guard; `revise-creative.ts:54` deterministic retry key (no `Date.now()`); `derivation.ts:980-989` checks existing version by actionId before create; `credits.ts:341-347` `getUsageByIdempotencyKey` check. |
| 4 | Failure/cancellation keeps source current and exposes safe idempotent retry. | ✅ VERIFIED | `derivation.ts:930-935` skips side effects when `action.status === "canceled" | "failed"` (source remains current); `derivation.ts:292-318` refunds on failure; `proposal.ts:376-408` `cancelRunningCreativeRevision` cancels both action and derivation; `AssistantActionCard.tsx:334-346` "Tentar novamente" retry button; `validate.ts:80` allows retry from failed status; `assistant-types.ts:37` allows `failed → confirmed` transition. |

**Score:** 4/4 success criteria verified.

## Coverage Summary

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| **CREV-01** | 205-01, 205-04 | User feedback on a selected creative creates an inspectable revision proposal tied to source creative | ✅ VERIFIED | `proposal.ts:250-359` proposeCreativeRevision; `intent.ts` visual/plan/ambiguous classifier; `orchestrator.ts:172, 225-266` routes creative feedback to handleCreativeRevisionMessage; `service.ts:78-166` maps proposal result to action card with planVersionId in inputSnapshot |
| **CREV-02** | 205-02 | User sees intended visual change, format, references, credit impact, writes before confirm | ✅ VERIFIED | `AssistantActionCard.tsx:186-240` renders intendedChanges, format, references (items with thumbnails OR count fallback), planVersionLabel, creditImpact, writes; `CreditConfirmModal.tsx` shows credit cost before final confirm with `Loader2` spinner when pending |
| **CREV-03** | 205-03 | User confirmation generates a new creative version linked to source creative and exact plan version | ✅ VERIFIED | `revise-creative.ts:96-120` enqueues `derivation.generate` event with `assistantActionId`, `planVersionId`, `generationMode: "creative_revision"`; `derivation.ts:991-1015` creates child creative version with `snapshot.planVersionId`, `snapshot.derivationId`, `snapshot.format`, `provenance.sourceVersionId`, `provenance.planVersionId`, `provenance.actionId` |
| **CREV-04** | 205-02, 205-03, 205-04 | Failed or canceled generation leaves source version current and supports idempotent retry | ✅ VERIFIED | `derivation.ts:930-935` skips side effects when action.status canceled/failed; `derivation.ts:292-318` calls refundCredits on failure; `proposal.ts:376-408` cancelRunningCreativeRevision transitions both action+derivation; `AssistantActionCard.tsx:334-346` retry button; `validate.ts:80` allows failed status on revalidate; `assistant-types.ts:37` allows `failed → confirmed` |
| **SAFE-02** | 205-01, 205-02, 205-03 | Confirmations, credit spends, generation jobs, callbacks, retries cannot create duplicate versions or charges | ✅ VERIFIED | (1) `proposal.ts:421-430` findVersionByActionId early-return; (2) `revise-creative.ts:54` deterministic retry key from `action.jobRefs.length + retryAttemptIndex` (no `Date.now()`); (3) `derivation.ts:980-989` checks existing version by actionId; (4) `credits.ts:341-347` getUsageByIdempotencyKey returns duplicate; (5) `proposal.ts:482-488` findActiveGenerationForLineage blocks concurrent confirm |

## Must-Haves (Aggregated Across 4 Plans)

### Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Feedback with visual keywords is classified as creative revision intent | ✅ | `intent.ts:21-29` — VISUAL_KEYWORDS regex returns `{ kind: "creative" }` |
| 2 | Vague creative feedback triggers a clarifying question before proposing | ✅ | `proposal.ts:274-281` — `classifyCreativeFeedback === "clarify"` returns clarify result and saves draft |
| 3 | Creative revision proposal is created tied to source creative version with frozen planVersionId | ✅ | `proposal.ts:308-321` — payload includes `planVersionId: source.planVersionId` frozen at `resolveCreativeRevisionSource` |
| 4 | Unsent creative feedback persists as draft across reloads | ✅ | `draft.ts` — scoped upsert by `workspaceId + clientProfileId + campaignId + threadId`; `0066_assistant_creative_feedback_drafts.sql` migration |
| 5 | Duplicate confirm of the same actionId returns idempotent without creating duplicate version | ✅ | `proposal.ts:421-430` — `findVersionByActionId` early-return |
| 6 | One active generation per creative lineage is enforced at confirm time | ✅ | `proposal.ts:482-488` — `findActiveGenerationForLineage` blocks confirm; `artifact-version.ts:477-494` queries `assistantActionRecords.status='running'` |
| 7 | Creative proposals are marked stale when working plan version changes | ✅ | `service.ts:168-188` — `markCreativeProposalsStaleOnPlanChange` uses `listArtifactProposalsByPlanVersion`; `artifact-version.ts:496-515` queries `payload->>'planVersionId'` |
| 8 | Failed generation job auto-refunds credits to the workspace | ✅ | `derivation.ts:292-318` — `refund-credits` step calls `refundCredits` with idempotency key `assistant-action:${actionId}:refund` |
| 9 | Duplicate refund call on same idempotency key returns duplicate without double-crediting | ✅ | `credits.ts:341-347` — `getUsageByIdempotencyKey` returns `{ status: "duplicate" }` |
| 10 | User sees credit cost in a secondary modal before final confirm | ✅ | `AssistantActionCard.tsx:351-360` renders `CreditConfirmModal`; `CreditConfirmModal.tsx:35-37` shows cost text |
| 11 | Action card displays references count, plan version label, and credit impact for creative revisions | ✅ | `AssistantActionCard.tsx:208-240` renders all three; `contract-display.ts:131-134` `shouldShowCreditImpact` returns true for revise_creative |
| 12 | Credit modal confirm button is disabled while mutation is pending | ✅ | `CreditConfirmModal.tsx:51-52` `disabled={isPending}` with `Loader2` spinner |
| 13 | Confirmed creative revision charges 5 credits with idempotency key and enqueues derivation.generate Inngest job | ✅ | `revise-creative.ts:56-120` — `spendCreditsOrApiError({action:"image_derivation", amount:5, idempotencyKey})` → `inngest.send({name:"derivation.generate", ...})` |
| 14 | Generation success creates child creative version linked to source creative and exact planVersionId | ✅ | `derivation.ts:991-1015` — `createArtifactVersion` with `snapshot.planVersionId: input.planVersionId` and `provenance.sourceVersionId`, `provenance.actionId` |
| 15 | Generation failure refunds credits and leaves source creative current | ✅ | `derivation.ts:292-318` (refund); source head only updated at `derivation.ts:1017-1019` on success |
| 16 | Duplicate confirm or callback cannot duplicate charges, jobs, or versions | ✅ | Multi-layer: actionId idempotency, deterministic retry key, existing-version check, idempotencyKey in credits |
| 17 | Retry on failed action charges again on same action record with new attempt key | ✅ | `revise-creative.ts:53-54` — `attempt = resolveAttemptIndex(ctx.inputSnapshot) + jobRefs.length` (no `Date.now()`) |
| 18 | One active generation per creative lineage blocks concurrent confirm | ✅ | `proposal.ts:482-488` calls `findActiveGenerationForLineage` |
| 19 | Orchestrator routes creative feedback to handleCreativeRevisionMessage before generic LLM when campaign is linked | ✅ | `orchestrator.ts:172, 225-266` — `classifyCreativeRevisionIntent` runs in campaign branch before generic LLM at line 280 |
| 20 | Ambiguous feedback triggers one clarifying question: plano or criativo? | ✅ | `orchestrator.ts:174-181` — returns "Você quer revisar o plano ou o criativo?" |
| 21 | Creative feedback draft persists via API and reloads on composer mount | ✅ | `route.ts:30-76` — GET returns `{ draftText }` or 404; PUT saves with zod validation, 2000-char limit |
| 22 | User can cancel a pending creative proposal from the action card | ✅ | `proposal.ts:361-367` `cancelCreativeRevision` transitions to canceled |

**Truths Score:** 22/22 verified.

### Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `app/src/server/assistant/creative-iteration/types.ts` | ✅ VERIFIED | 77 lines, exports `CreativeRevisionSource`, `CreativeRevisionResult`, `CreativeRevisionProposalResult`, `GenerateCreativeRevisionProposal` |
| `app/src/server/assistant/creative-iteration/intent.ts` | ✅ VERIFIED | 39 lines, exports `classifyCreativeRevisionIntent` with VISUAL_KEYWORDS / PLAN_KEYWORDS / GENERIC_REVISE_HINTS regexes |
| `app/src/server/assistant/creative-iteration/proposal.ts` | ✅ VERIFIED | 523 lines, exports `proposeCreativeRevision`, `confirmCreativeRevision`, `cancelCreativeRevision`, `cancelRunningCreativeRevision`, `resolveCreativeRevisionSource` |
| `app/src/server/assistant/creative-iteration/draft.ts` | ✅ VERIFIED | 80 lines, exports `getCreativeFeedbackDraft`, `saveCreativeFeedbackDraft`, `clearCreativeFeedbackDraft`, `CreativeFeedbackDraftValidationError` |
| `app/src/server/assistant/creative-iteration/service.ts` | ✅ VERIFIED | 188 lines, exports `handleCreativeRevisionMessage`, `buildReviseCreativeActionDisplay`, `markCreativeProposalsStaleOnPlanChange`, `resolveCreativeReferences` |
| `app/drizzle/0066_assistant_creative_feedback_drafts.sql` | ✅ VERIFIED | 15 lines, creates `assistant_creative_feedback_drafts` table with scope index |
| `app/src/server/billing/credits.ts` (refundCredits) | ✅ VERIFIED | Lines 333-428, 95 lines, full implementation: idempotency check, dev-admin bypass, transaction credits back, refund transaction |
| `app/src/components/assistant/CreditConfirmModal.tsx` | ✅ VERIFIED | 67 lines, Dialog with cost text, Confirmar (Loader2 spinner when pending), Cancelar buttons, data-testid |
| `app/src/components/assistant/AssistantActionCard.tsx` (creative fields) | ✅ VERIFIED | Lines 94, 100, 124, 144, 186-240, 334-360 — `isReviseCreative` flag, intendedChanges list, format row, references items/count, planVersionLabel, retry button, CreditConfirmModal integration |
| `app/src/server/assistant/action-contracts/contracts/revise-creative.ts` | ✅ VERIFIED | 38 lines, exports `reviseCreativeContract` + `reviseCreativeInputSchema` with required `planVersionId`, creditImpact 5 créditos |
| `app/src/server/assistant/action-execution/handlers/revise-creative.ts` | ✅ VERIFIED | 143 lines, full handler: charge → confirm → enqueue → async mode; deterministic retry key from `jobRefs.length` |
| `app/src/server/jobs/derivation.ts` (creative revision callbacks) | ✅ VERIFIED | Lines 75 (import refundCredits), 292-318 (failure refund), 919-1019 (success version create + head update, gated on action.status) |
| `app/src/server/assistant/orchestrator.ts` (unified classifier) | ✅ VERIFIED | Lines 21-22, 172, 174-181, 184-223, 225-266 — unified intent classifier branches plan/creative/ambiguous before generic LLM |
| `app/src/app/api/assistant/threads/[threadId]/creative-revisions/route.ts` | ✅ VERIFIED | 76 lines, GET (returns draft or 404), PUT (validates + saves) with workspace-scoped auth |
| `app/src/server/repositories/artifact-version.ts` (helpers) | ✅ VERIFIED | Lines 477-515 — `findActiveGenerationForLineage` (queries status='running' + lineageId JSON path), `listArtifactProposalsByPlanVersion` |
| `app/src/lib/assistant/artifact-version.ts` (payload) | ✅ VERIFIED | Line 104 — `planVersionId: z.string().uuid()` added to `creative_revision` payload variant |
| `app/src/lib/assistant/contract-display.ts` (extension) | ✅ VERIFIED | Lines 15-23, 96-125, 131-134 — `intendedChanges`, `referenceCount`, `referenceItems`, `planVersionLabel`, `format` added; `shouldShowCreditImpact` returns true for revise_creative |
| `app/src/server/assistant/action-contracts/validate.ts` (retry support) | ✅ VERIFIED | Line 80 — `action.status !== "pending" && action.status !== "failed"` allows retry |
| `app/src/server/repositories/assistant-types.ts` (transition table) | ✅ VERIFIED | Line 37 — `failed: ["confirmed"]` transition added for retry support |

### Key Links

| From | To | Via | Status | Evidence |
|------|----|----|--------|----------|
| `proposal.ts` | `repositories/artifact-version.ts` | `createArtifactProposal`, `transitionArtifactProposal`, `staleSiblingProposals`, `findActiveGenerationForLineage`, `findVersionByActionId` | ✅ WIRED | Lines 8-18 imports; lines 323, 490, 497-501, 482, 422 calls |
| `draft.ts` | `db/schema.ts` | `assistantCreativeFeedbackDrafts` table | ✅ WIRED | Lines 2-3 imports; lines 35-78 select/insert/delete with `onConflictDoUpdate` |
| `revise-creative.ts` | `billing/gates.ts` | `spendCreditsOrApiError` with deterministic idempotency key | ✅ WIRED | Line 3 import; lines 56-68 call with `idempotencyKey = "assistant-action:${actionId}:creative_revision:retry:${attempt}"` |
| `revise-creative.ts` | `jobs/client.ts` | `inngest.send("derivation.generate", ...)` | ✅ WIRED | Line 11 import; lines 106-120 send event with `assistantActionId`, `planVersionId`, `generationMode: "creative_revision"` |
| `derivation.ts` | `billing/credits.ts` | `refundCredits` on job failure | ✅ WIRED | Line 75 import; lines 295-307 call with `idempotencyKey = "assistant-action:${actionId}:refund"` |
| `derivation.ts` | `repositories/artifact-version.ts` | `createArtifactVersion` + `updateArtifactHead` on job success | ✅ WIRED | Lines 77-81 imports; lines 991-1015 create version with `planVersionId`; lines 1017-1019 update head |
| `orchestrator.ts` | `creative-iteration/service.ts` | `handleCreativeRevisionMessage` for creative intent | ✅ WIRED | Lines 21-22 imports; line 226 call |
| `orchestrator.ts` | `creative-iteration/intent.ts` | `classifyCreativeRevisionIntent` pre-LLM routing | ✅ WIRED | Line 21 import; line 172 call |
| `service.ts` | `proposal.ts` | `proposeCreativeRevision` | ✅ WIRED | Line 10 import; line 101 call |
| `route.ts` (creative-revisions) | `draft.ts` | `get/saveCreativeFeedbackDraft` | ✅ WIRED | Lines 7-10 imports; lines 37-43, 60-68 calls |
| `AssistantActionCard.tsx` | `CreditConfirmModal.tsx` | JSX render with `open`, `creditCost`, `isPending`, `onConfirm`, `onCancel` | ✅ WIRED | Line 21 import; lines 351-360 render |
| `contracts/index.ts` | `revise-creative.ts` (contract) | `registerActionContract(reviseCreativeContract)` | ✅ WIRED | Line 11 import; line 22 register |
| `execute.ts` | `revise-creative.ts` (handler) | `revise_creative: executeReviseCreative` in HANDLERS map | ✅ WIRED | Line 43 wiring |
| `proposal.ts` (cancelRunningCreativeRevision) | `repositories/assistant-action.ts`, `repositories/derivation.ts` | `transitionAssistantAction` + `updateDerivationStatus` | ✅ WIRED | Lines 369-374 imports; lines 381-385, 390-397 calls |

## Anti-Patterns Check

| Anti-Pattern | Found? | Notes |
|--------------|--------|-------|
| Stub functions returning hardcoded values | ❌ NO | All functions have real implementations — verified by reading source |
| Type-only files with no runtime behavior | ❌ NO | `types.ts` exports interfaces used by tests + implementations |
| Missing key wiring between modules | ❌ NO | All key_links verified — imports + usage present |
| Tests that mock everything (defeats verification) | ❌ NO | Tests use repository mocking pattern (appropriate for unit tests), verify key behaviors |
| Derivation success callback NOT gating on `action.status` | ❌ NO | `derivation.ts:930-935` correctly gates on `action.status === "canceled" | "failed"` |
| Retry keys using `Date.now()` | ❌ NO | `grep -n "Date.now" app/src/server/assistant/action-execution/handlers/revise-creative.ts` returns no matches; uses `jobRefs.length + retryAttemptIndex` |

## Test Verification

| Test Suite | Tests | Status |
|------------|-------|--------|
| `src/server/assistant/creative-iteration/intent.test.ts` | 7 | ✅ PASS |
| `src/server/assistant/creative-iteration/draft.test.ts` | 8 | ✅ PASS |
| `src/server/assistant/creative-iteration/proposal.test.ts` | 19 | ✅ PASS |
| `src/server/assistant/creative-iteration/service.test.ts` | 11 | ✅ PASS |
| `src/server/billing/credits.test.ts` (refundCredits) | 5+ | ✅ PASS |
| `src/components/assistant/CreditConfirmModal.test.tsx` | 8 | ✅ PASS |
| `src/components/assistant/AssistantActionCard.test.tsx` (creative) | 6+ | ✅ PASS |
| `src/server/assistant/action-execution/handlers/revise-creative.test.ts` | 16 | ✅ PASS |
| `src/server/jobs/derivation.test.ts` (creative revision) | 10+ | ✅ PASS |
| `src/server/assistant/orchestrator.test.ts` (creative routing) | 6+ | ✅ PASS |
| `src/app/api/assistant/threads/[threadId]/creative-revisions/route.test.ts` | 9 | ✅ PASS |
| `src/lib/assistant/contract-display.test.ts` (creative fields) | 2+ | ✅ PASS |

**Total:** 167+ tests passing across Phase 205 implementations (verified via `npx vitest run`).

## Human Verification Required

Items that benefit from human testing (cannot verify programmatically):

1. **Visual appearance of CreditConfirmModal** — does the dialog render correctly, with appropriate spacing, focus trap, and accessibility?
2. **End-to-end UX flow** — when user types "muda a cor de fundo" in chat, does the proposal card appear with correct fields and the modal confirmation flow work as designed?
3. **Reload behavior** — when user reloads the page mid-generation, does the card restore correctly with the `running` status and persist `pending` proposals?
4. **Real-time cancellation UX** — when user clicks "Cancelar" on a running card, does the card transition to `canceled` state promptly and the source creative remain visible as current?
5. **Retry affordance** — when a generation fails, does the "Tentar novamente" button appear, re-charge credits, and re-enqueue the job correctly?

## Final Verdict

**Status:** PASSED
**Score:** 22/22 must-haves verified

All 4 success criteria achieved. All 5 requirements (CREV-01, CREV-02, CREV-03, CREV-04, SAFE-02) delivered through working code. All idempotency guards present (actionId, retry-key, version-check, idempotency-key). All anti-patterns explicitly checked and absent. 167+ tests passing. The phase goal — "Let users create recoverable creative revisions tied to exact source creative and plan versions" — is achieved.

---

_Verified: 2026-06-28T01:59:30Z_
_Verifier: Claude (gsd-verifier)_

## Self-Check: PASSED