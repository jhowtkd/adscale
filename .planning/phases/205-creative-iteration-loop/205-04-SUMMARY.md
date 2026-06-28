---
phase: 205-creative-iteration-loop
plan: "04"
subsystem: api, server, assistant
tags: [orchestrator, intent-classifier, draft-api, vitest, action-card, creative-iteration, tdd]

# Dependency graph
requires:
  - phase: 205-creative-iteration-loop plan 01
    provides: classifyCreativeRevisionIntent, proposeCreativeRevision, draft persistence, types
  - phase: 205-creative-iteration-loop plan 02
    provides: ClientActionCardDisplay extended with creative fields, shouldShowCreditImpact
  - phase: 204-plan-iteration-loop
    provides: handlePlanRevisionMessage, buildReviseCreativePlanActionDisplay, draft route pattern
  - phase: 203-artifact-version-foundation
    provides: getThreadArtifactVersionState (unchanged regression target)
provides:
  - handleCreativeRevisionMessage service facade mapping intent to clarify/redirect/ask_target/proposal/action_card
  - buildReviseCreativeActionDisplay populates creative fields with referenceItems/count fallback
  - markCreativeProposalsStaleOnPlanChange transitions dependent pending creative proposals when plan version changes
  - Unified orchestrator intent classifier routing plan vs creative vs ambiguous vs continue before generic LLM
  - Creative-revisions draft API route (GET/PUT) for composer autosave
  - revise_creative action contract with planVersionId binding
  - listArtifactProposalsByPlanVersion repository helper (JSON payload.planVersionId query)
affects:
  - 205-03 confirm handler (consumes action card inputSnapshot with planVersionId)
  - 205-05+ UI (uses unified intent classifier via orchestrator + draft route)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN atomic commits per task (test + feat pairs)"
    - "Mirrors plan-iteration/service.ts facade shape with creative-specific fields"
    - "Reference resolution: workspaceAssets lookup → referenceItems when found, referenceCount fallback when empty"
    - "Unified orchestrator pre-LLM branch: classifyCreativeRevisionIntent → plan/creative/ambiguous/continue"
    - "API route pattern: scopedRequest helper + workspace auth + thread campaign check + zod strict validation"
    - "JSON payload extraction via drizzle sql template for planVersionId queries"

key-files:
  created:
    - app/src/server/assistant/creative-iteration/service.ts
    - app/src/server/assistant/creative-iteration/service.test.ts
    - app/src/server/assistant/action-contracts/contracts/revise-creative.ts
    - app/src/app/api/assistant/threads/[threadId]/creative-revisions/route.ts
    - app/src/app/api/assistant/threads/[threadId]/creative-revisions/route.test.ts
  modified:
    - app/src/server/repositories/artifact-version.ts (added listArtifactProposalsByPlanVersion)
    - app/src/server/assistant/orchestrator.ts (unified intent classifier routing)
    - app/src/server/assistant/orchestrator.test.ts (creative revision routing tests)
    - app/src/server/assistant/action-contracts/contracts/index.ts (registered reviseCreativeContract)

key-decisions:
  - "handleCreativeRevisionMessage returns same discriminated union as handlePlanRevisionMessage — orchestrator routes both handlers with same shape"
  - "Action card inputSnapshot includes planVersionId — handler (Plan 03) uses it for plan binding"
  - "buildReviseCreativeActionDisplay spreads baseDisplay then overlays creative fields — contract's creditImpact from validateProposeAction is preserved, display builder adds '5 créditos' label"
  - "Reference rendering strategy: resolvedReferences.length > 0 → referenceItems array, else referenceCount from payload.referenceIds.length — keeps UI informative when assets available, falls back to count when not"
  - "resolveCreativeReferences injectable via input.resolveReferences — keeps tests deterministic without DB"
  - "markCreativeProposalsStaleOnPlanChange queries payload->>'planVersionId' JSON path (no DB migration needed) — Plan 01 stored planVersionId in payload"
  - "Orchestrator reorders pre-LLM branching: classifyCreativeRevisionIntent runs FIRST (before plan handler), returns one of plan/creative/ambiguous/continue"
  - "Ambiguous intent yields ONE clarifying question 'Você quer revisar o plano ou o criativo?' and short-circuits — no LLM call, no handler call"
  - "Continue intent (greeting, unrelated chat) falls through to generic LLM — preserves existing assistant behavior"
  - "Existing 'routes plan revision' test updated to mock classifyCreativeRevisionIntent returning 'plan' — message 'Ajuste o CTA do plano' contains plan keywords"
  - "Attachment IDs passed to creative handler via input.attachments?.map(a => a.assetId) — uses assetId not id (interface field name)"
  - "reviseCreativeContract registered in contracts/index.ts so validateProposeAction('revise_creative') resolves at runtime"

patterns-established:
  - "Pattern: service facade as orchestrator boundary — classify → propose → validate → build display → create action"
  - "Pattern: reference resolution with items-then-count fallback for chat attachments in revision proposals"
  - "Pattern: stale-marking dependent proposals on plan change via JSON payload extraction (no schema migration)"
  - "Pattern: unified intent classifier pre-LLM routing with explicit ambiguous branch"
  - "Pattern: API route draft with strict zod schema + scopedRequest helper mirroring plan-revisions route"

requirements-completed: [CREV-01, CREV-04, SAFE-02]

# Metrics
duration: 7min
completed: 2026-06-28
---
# Phase 205 Plan 04: Service Facade + Unified Orchestrator + Draft API Summary

**Creative revision service facade (handleCreativeRevisionMessage), unified orchestrator intent classifier (plan vs creative vs ambiguous), and creative-revisions draft API route — wires creative-iteration module into the assistant chat loop**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-28T00:44:05Z
- **Completed:** 2026-06-28T00:50:25Z
- **Tasks:** 3
- **Files modified:** 9 (6 created, 3 modified)
- **Tests added:** 37 (11 service + 17 orchestrator new + 9 route)

## Accomplishments

- `handleCreativeRevisionMessage` mirrors `handlePlanRevisionMessage` signature — classifies intent, calls `proposeCreativeRevision`, maps `clarify`/`ask_target`/`redirect` to `{ kind: "assistant" }`, maps `proposal` to `{ kind: "action_card" }` after `validateProposeAction` + `createAssistantAction`
- `buildReviseCreativeActionDisplay` produces creative-specific action card display: `actionType: "revise_creative"`, `intendedChanges`, `format`, `referenceItems` (when resolved) OR `referenceCount` (fallback), `planVersionLabel: "v2"`, `mismatchWarning`, `creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" }`
- Action card `inputSnapshot` includes `planVersionId` (frozen at proposal creation) — handler in Plan 03 uses this for plan binding
- `markCreativeProposalsStaleOnPlanChange` queries `assistantArtifactProposals` by `payload->>'planVersionId'` JSON path, transitions `pending` → `stale` for matching `creative_revision` proposals, returns list of stale IDs
- `listArtifactProposalsByPlanVersion` repository helper added for stale-mark queries (no DB migration needed)
- Orchestrator unified intent classifier: `classifyCreativeRevisionIntent` runs first in campaign branch, routes `plan` → `handlePlanRevisionMessage` (existing), `creative` → `handleCreativeRevisionMessage` (new), `ambiguous` → clarifying question, `continue` → fall through to LLM
- Ambiguous feedback yields ONE question: "Você quer revisar o plano ou o criativo?" and short-circuits (no LLM, no handler)
- Creative handler receives `attachmentReferenceIds` from `input.attachments?.map(a => a.assetId)` — chat attachments become proposal references
- `creative-revisions` API route: `GET` returns `{ draftText }` or 404 when no draft/no campaign, `PUT` saves with strict zod validation (empty body 400, >2000 chars 400), workspace-scoped via `requireWorkspaceAccess`
- `revise_creative` action contract registered: `inputSchema` requires `proposalId`, `lineageId`, `sourceVersionId`, `payloadDigest`, `planVersionId`; `creditImpact: image_derivation`
- 268 tests pass across `src/server/assistant/` + `src/app/api/assistant/` (no regressions); `npm run build` succeeds

## Task Commits

Each task followed TDD with atomic commits (RED→GREEN pairs):

1. **Task 1: handleCreativeRevisionMessage service facade** — `cdf2fe61` (test) + `0ce286d8` (feat)
2. **Task 2: Orchestrator unified intent classifier** — `1dda7d0f` (test) + `30c1ea3e` (feat)
3. **Task 3: Creative-revisions draft API route** — `45350ed1` (test) + `eb641e9c` (feat)

**Plan metadata:** pending (docs commit after SUMMARY + state updates)

_Note: Task 1 implementation commit `0ce286d8` also includes the `reviseCreativeContract` registration and `listArtifactProposalsByPlanVersion` repository helper, which were prerequisite for `validateProposeAction("revise_creative")` to resolve at runtime and for `markCreativeProposalsStaleOnPlanChange` to query by payload JSON path._

## Files Created/Modified

- `app/src/server/assistant/creative-iteration/service.ts` — `handleCreativeRevisionMessage`, `buildReviseCreativeActionDisplay`, `markCreativeProposalsStaleOnPlanChange`, `resolveCreativeReferences`
- `app/src/server/assistant/creative-iteration/service.test.ts` — 11 tests covering all behaviors (intent continue, clarify, ask_target, redirect, action_card; reference items/count fallback; mismatchWarning; attachmentReferenceIds pass-through; markStale pending/empty)
- `app/src/server/assistant/action-contracts/contracts/revise-creative.ts` — `reviseCreativeInputSchema` + `reviseCreativeContract` with `planVersionId` binding
- `app/src/server/assistant/action-contracts/contracts/index.ts` — registered `reviseCreativeContract`
- `app/src/server/repositories/artifact-version.ts` — added `listArtifactProposalsByPlanVersion` (queries `payload->>'planVersionId'`, status='pending', proposalType='creative_revision')
- `app/src/server/assistant/orchestrator.ts` — imported unified classifier + creative handler; replaced direct `handlePlanRevisionMessage` block with intent-routed branching (plan/creative/ambiguous/continue)
- `app/src/server/assistant/orchestrator.test.ts` — extended with 6 new tests for creative routing + updated 1 existing test for plan classifier mock
- `app/src/app/api/assistant/threads/[threadId]/creative-revisions/route.ts` — `GET` (returns draft or 404) + `PUT` (validates + saves draft) with workspace-scoped auth
- `app/src/app/api/assistant/threads/[threadId]/creative-revisions/route.test.ts` — 9 tests covering GET/PUT, validation, cross-workspace rejection, no-campaign 404

## Decisions Made

- **`reviseCreativeContract` registered as part of Task 1 implementation.** Required for `validateProposeAction("revise_creative")` to resolve at runtime; not separate from the service facade work.
- **`handleCreativeRevisionMessage` accepts `resolveReferences` as injectable function.** Keeps tests deterministic without hitting the DB; production falls back to `resolveCreativeReferences` which queries `workspaceAssets` by ID.
- **`buildReviseCreativeActionDisplay` uses conditional spread for referenceItems vs referenceCount.** Avoids `referenceCount: undefined` in display when items present — keeps the display shape clean for the UI parser.
- **`markCreativeProposalsStaleOnPlanChange` uses `payload->>'planVersionId'` JSON extraction.** Plan 01 stored `planVersionId` in the `creative_revision` payload (no DB migration), so stale-detection queries via JSON path. Consistent with the `findActiveGenerationForLineage` JSON extraction pattern.
- **Orchestrator reorders pre-LLM branching — unified classifier runs FIRST.** Before my change, `handlePlanRevisionMessage` was always called for campaign threads (and internally classified). Now `classifyCreativeRevisionIntent` routes to the correct handler explicitly, preventing misclassification (e.g., visual keywords going to plan handler).
- **Existing `routes plan revision` test updated with `mockClassifyCreativeIntent.mockReturnValue({ kind: "plan" })`.** The message "Ajuste o CTA do plano" naturally classifies as plan (both `cta` and `plano` keywords), but the test previously didn't set this mock because the unified classifier didn't exist. Adding the mock keeps the existing test's intent (plan keywords → plan handler).
- **Attachment IDs use `assetId` not `id`.** `AssistantChatAttachment` interface defines `assetId: string` as the primary identifier — `id` doesn't exist on the interface.
- **GET returns 404 when no draft exists (per plan), unlike plan-revisions which returns empty string.** Plan behavior differs: creative drafts are only relevant when actively composing; absence means "nothing to restore" vs plan drafts which always return whatever was last saved.
- **Route uses `apiError("threadNotFound", 404)` for no-thread/no-campaign cases.** Reuses the same error code as plan-revisions for consistent client-side handling.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `handleCreativeRevisionMessage` ready for orchestrator integration (already wired in Task 2)
- Orchestrator routes creative feedback to handler with attachments → action card events emitted correctly
- `markCreativeProposalsStaleOnPlanChange` ready for Plan 204 plan-confirm flow to call when working plan changes
- `creative-revisions` API route ready for client composer autosave integration
- `reviseCreativeContract` registered — `validateProposeAction("revise_creative")` resolves at runtime
- Plan 03 confirm handler can consume `inputSnapshot.planVersionId` for plan binding during generation
- Plan 02 UI components (`AssistantActionCard`, `CreditConfirmModal`) can render action cards with the creative display fields
- All 268 tests across assistant module pass — no regressions

---
*Phase: 205-creative-iteration-loop*
*Completed: 2026-06-28*

## Self-Check: PASSED

All 5 created files exist on disk. All 6 task commits (3 RED + 3 GREEN) verified in git log. All test suites green (268 tests pass across assistant module + API routes). Production build succeeds.
