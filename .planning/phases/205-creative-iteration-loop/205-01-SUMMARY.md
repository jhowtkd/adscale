---
phase: 205-creative-iteration-loop
plan: "01"
subsystem: api
tags: [openai, zod, drizzle, artifact-version, plan-binding, vitest, creative-iteration]

# Dependency graph
requires:
  - phase: 203-artifact-version-foundation
    provides: artifact proposals, version creation, head CAS, creative snapshots
  - phase: 204-plan-iteration-loop
    provides: canonicalProposalPayloadDigest, draft persistence pattern, proposal/confirm/cancel flow
provides:
  - Creative revision intent classifier (visual vs plan vs ambiguous vs continue)
  - Thread-scoped unsent creative feedback draft persistence (max 2k chars)
  - Creative revision proposal service with frozen planVersionId binding
  - One-active-generation guard via findActiveGenerationForLineage
  - Idempotent confirm keyed by actionId (no duplicate child version)
  - Format-change redirect and ask-target for ambiguous/multiple lineages
  - payloadDigest accepted for both plan_revision and creative_revision variants
affects:
  - 205-02 creative revision UI (depends on proposal result shape)
  - 205-03 confirm handler (uses confirmCreativeRevision return shape)
  - 205-04 orchestrator + facade (uses proposeCreativeRevision routing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirrors plan-iteration module shape: types, intent, draft, proposal"
    - "Server-computed proposedChanges via injectable generator for deterministic tests"
    - "confirmCreativeRevision does NOT create version synchronously — handler (Plan 03) creates version in job callback"
    - "canonicalProposalPayloadDigest widened to accept any ArtifactProposalPayload (stable JSON canonicalization)"

key-files:
  created:
    - app/src/server/assistant/creative-iteration/types.ts
    - app/src/server/assistant/creative-iteration/intent.ts
    - app/src/server/assistant/creative-iteration/intent.test.ts
    - app/src/server/assistant/creative-iteration/draft.ts
    - app/src/server/assistant/creative-iteration/draft.test.ts
    - app/src/server/assistant/creative-iteration/proposal.ts
    - app/src/server/assistant/creative-iteration/proposal.test.ts
    - app/drizzle/0066_assistant_creative_feedback_drafts.sql
  modified:
    - app/src/server/db/schema.ts (added assistantCreativeFeedbackDrafts table)
    - app/src/lib/assistant/artifact-version.ts (creative_revision payload adds planVersionId)
    - app/src/server/assistant/plan-iteration/digest.ts (widened to accept any ArtifactProposalPayload)
    - app/src/server/repositories/artifact-version.ts (added findActiveGenerationForLineage)

key-decisions:
  - "proposeCreativeRevision freezes planVersionId at proposal creation by reading current plan lineage head (workingVersionId ?? approvedCurrentVersionId)"
  - "Confirm is non-version-creating: returns { proposal, head, idempotent } only; handler enqueues job that creates version on callback"
  - "One-active-generation guard queries assistantActionRecords.status='running' filtered by inputSnapshot->>'lineageId' — NOT by proposal status (confirmed is terminal, would block all future revisions)"
  - "Format-change request (9:16, 1:1, vertical, horizontal) returns redirect (not propose) — uses Phase 203 format-adaptation flow"
  - "Vague feedback (short tokens / 'melhora' alone) triggers clarify and saves draft — same as Phase 204 pattern"
  - "canonicalProposalPayloadDigest widened from plan_revision-only to any ArtifactProposalPayload via stable() of full payload — required because creative_revision has different schema than plan_revision"
  - "findActiveGenerationForLineage uses SQL JSON extraction on inputSnapshot->>'lineageId' (action records carry lineageId in inputSnapshot per Phase 203 convention)"

patterns-established:
  - "Pattern: frozen-plan-binding at proposal creation — planVersionId captured in payload, never re-resolved at confirm"
  - "Pattern: non-creating confirm — confirm transitions proposal + stales siblings, version created later in job callback"
  - "Pattern: redirect on format-change keywords — keeps creative_revision scope tight (visual only)"
  - "Pattern: ask-target on multiple creative lineages — explicit format disambiguation in chat before proposal"

requirements-completed: [CREV-01, SAFE-02]

# Metrics
duration: 45min
completed: 2026-06-28
---
# Phase 205 Plan 01: Creative Iteration Core Domain Summary

**Creative revision intent classifier, thread-scoped draft persistence, and proposal service with frozen planVersionId binding + one-active-generation guard + idempotent confirm**

## Performance

- **Duration:** 45 min (continuation agent — resumed incomplete Tasks 1+2, completed Task 3)
- **Started:** 2026-06-27T18:00:00Z (Task 1)
- **Completed:** 2026-06-28T01:42:00Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- `classifyCreativeRevisionIntent` routes visual keywords (cor, layout, imagem, fundo, foto, etc.) → creative, plan-field keywords (plano, estratégia, ângulo, etc.) → plan, ambiguous short tokens → clarify, unrelated chat → continue
- `assistant_creative_feedback_drafts` table (migration 0066) mirrors plan drafts with scoped upsert by `workspaceId + clientProfileId + campaignId + threadId`
- `proposeCreativeRevision` creates `creative_revision` proposal with frozen `planVersionId` (read from plan lineage head at creation), `intendedChanges`, `format`, `referenceIds`, `creditImpact: 5`, and `writes`; clears draft on success
- `confirmCreativeRevision` validates proposal status (pending, not stale), payload digest match, and **one-active-generation guard** via `findActiveGenerationForLineage` — rejects with `ArtifactVersionValidationError` if another `running` action exists on the lineage
- `findVersionByActionId` enables idempotent confirm keyed by `provenance.actionId` — returns existing version without creating duplicate
- `cancelCreativeRevision` transitions proposal to `canceled`
- Format-change keywords (9:16, vertical, etc.) redirect to format-adaptation flow (not creative_revision)
- Ask-target questions for missing/multiple creative lineages, missing plan lineage, or missing plan version
- 34 automated tests green (7 intent + 8 draft + 19 proposal); production build passes

## Task Commits

Each task followed TDD with atomic commits:

1. **Task 1: Intent classifier + types + test stubs** — `ef8e31a5` (test)
2. **Task 2: DB migration + draft persistence + schema** — `a8ecf29c` (feat)
3. **Task 3: Proposal service with planVersionId binding + idempotency** — `baa03545` (feat)

**Plan metadata:** pending (docs commit after SUMMARY + state updates)

_Note: Task 1 had a single test commit (RED then GREEN combined). Task 2 was a single feat commit (schema + migration + draft service together as one cohesive change). Task 3 was a single feat commit (proposal service + tests + payload extension together)._

## Files Created/Modified

- `app/src/server/assistant/creative-iteration/types.ts` — `CreativeRevisionSource`, `CreativeRevisionResult`, `CreativeRevisionSourceResult`, `CreativeRevisionModelOutput`, `GenerateCreativeRevisionProposal`
- `app/src/server/assistant/creative-iteration/intent.ts` — `classifyCreativeRevisionIntent` with visual/plan/ambiguous/continue routing
- `app/src/server/assistant/creative-iteration/intent.test.ts` — 7 pure-function tests
- `app/src/server/assistant/creative-iteration/draft.ts` — `getCreativeFeedbackDraft`, `saveCreativeFeedbackDraft`, `clearCreativeFeedbackDraft` (mirrors plan-iteration/draft.ts)
- `app/src/server/assistant/creative-iteration/draft.test.ts` — 8 scoped-persistence tests
- `app/src/server/assistant/creative-iteration/proposal.ts` — `proposeCreativeRevision`, `confirmCreativeRevision`, `cancelCreativeRevision`, `resolveCreativeRevisionSource` + injectable `generateCreativeRevisionProposal`
- `app/src/server/assistant/creative-iteration/proposal.test.ts` — 19 tests covering clarify/redirect/ask_target/proposal paths, idempotent confirm, digest mismatch, stale proposal, one-active-generation guard
- `app/drizzle/0066_assistant_creative_feedback_drafts.sql` — creative draft table with scope index
- `app/src/server/db/schema.ts` — added `assistantCreativeFeedbackDrafts` table (mirrors plan draft table)
- `app/src/lib/assistant/artifact-version.ts` — `creative_revision` payload variant adds `planVersionId: z.string().uuid()`
- `app/src/server/assistant/plan-iteration/digest.ts` — `canonicalProposalPayloadDigest` widened to accept any `ArtifactProposalPayload` (was plan_revision-only)
- `app/src/server/repositories/artifact-version.ts` — added `findActiveGenerationForLineage` (queries `assistantActionRecords.status='running'` filtered by `inputSnapshot->>'lineageId'`)

## Decisions Made

- **`canonicalProposalPayloadDigest` widened, not duplicated.** The digest function needed to accept `creative_revision` payloads (different schema from `plan_revision`), but the canonicalization algorithm is the same. Widening the parameter type and hashing the full stable payload keeps a single source of truth for proposal confirm binding.
- **One-active-generation guard uses `inputSnapshot->>'lineageId'` SQL extraction.** Action records already carry `lineageId` in their `inputSnapshot` JSON (Phase 203 convention). Querying via JSON extraction avoids needing a separate `lineageId` column on action records.
- **Confirm is non-version-creating.** Unlike `confirmPlanRevision` (which creates child version synchronously), `confirmCreativeRevision` only transitions the proposal to `confirmed` and stales siblings. The new version is created in the Inngest job callback (Plan 03) after credits are charged and the job enqueues successfully. This decouples proposal confirmation from async generation.
- **Format-change redirected, not parsed.** A request like "faz em 9:16" returns `{ kind: "redirect" }` pointing to Phase 203 format-adaptation, not a creative_revision proposal. Keeps creative_revision scope to visual changes only.
- **Vague feedback saves draft before clarifying.** Same pattern as Phase 204: a short token like "melhora" persists as draft so user doesn't lose input across reload.
- **Plan lineage must exist before creative revision.** If no plan lineage in thread, proposeCreativeRevision returns `{ kind: "ask_target" }` — explicit "plan must exist first" message. Decision from CONTEXT §"Creative revision target".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened canonicalProposalPayloadDigest to accept any ArtifactProposalPayload**
- **Found during:** Task 3 (proposal.ts type errors)
- **Issue:** `canonicalProposalPayloadDigest` was typed `Extract<ArtifactProposalPayload, { type: "plan_revision" }>` — wouldn't accept `creative_revision` payload
- **Fix:** Widened parameter to `ArtifactProposalPayload`; algorithm unchanged (stable JSON canonicalization of full payload)
- **Files modified:** `app/src/server/assistant/plan-iteration/digest.ts`
- **Verification:** TypeScript compiles, existing plan_revision callers unaffected
- **Committed in:** `baa03545`

**2. [Rule 1 - Bug] findActiveGenerationForLineage uses status='running' not proposal status**
- **Found during:** Task 3 test review
- **Issue:** Plan said "filter by `action.status === 'running'` OR derivation `queued`/`processing` (NOT proposal `confirmed`)" — earlier draft risk was filtering by proposal status which would block all future revisions after first generation completes
- **Fix:** Implemented `findActiveGenerationForLineage` querying `assistantActionRecords` where `status='running'` and `inputSnapshot->>'lineageId' = lineageId` — proposal status is NOT used
- **Files modified:** `app/src/server/repositories/artifact-version.ts`
- **Verification:** Test `rejects when another generation is already running on lineage` passes; existing confirm after generation completes would work (proposal is `confirmed`/`stale`, not `running`)
- **Committed in:** `baa03545`

**3. [Rule 3 - Blocking] Imported sql from drizzle-orm for JSON extraction**
- **Found during:** Task 3 (findActiveGenerationForLineage)
- **Issue:** Needed `sql` template tag from drizzle-orm for `inputSnapshot->>'lineageId'` JSON extraction
- **Fix:** Added `sql` to existing import list in `repositories/artifact-version.ts`
- **Files modified:** `app/src/server/repositories/artifact-version.ts`
- **Verification:** TypeScript compiles, query runs without runtime error in tests
- **Committed in:** `baa03545`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes required for type-correctness and one-active-generation correctness (the most critical SAFE-02 invariant). No scope creep beyond core domain.

## Issues Encountered

- **Continuation agent resumed incomplete Tasks 1+2.** Previous executor session terminated with empty return after committing Tasks 1 and 2. Task 3 files (proposal.ts + test) were written but uncommitted, and 3 supporting modifications were uncommitted (artifact-version.ts, digest.ts, artifact-version repo). Resumed by running tests first (34/34 passing), then committing Task 3 atomically, then proceeding with SUMMARY + state updates.
- **Test path correction.** `cd app && npx vitest run app/src/server/assistant/creative-iteration/ --config app/config/vitest.config.ts` failed with `Cannot resolve entry module app/config/vitest.config.ts`. Correct invocation is `npx vitest run src/server/assistant/creative-iteration/ --config config/vitest.config.ts` (run from `app/` workdir, no `app/` prefix). Same pattern works for all `app/config/vitest.config.ts` test runs in this repo.

## User Setup Required

None — uses existing OpenAI and PostgreSQL configuration.

## Next Phase Readiness

- `proposeCreativeRevision` returns `{ kind: "clarify" | "redirect" | "ask_target" | "proposal" }` — UI/orchestrator can route each variant
- `confirmCreativeRevision` returns `{ proposal, head, idempotent, version: null }` — handler (Plan 03) charges credits + enqueues Inngest job + creates version in job callback
- `cancelCreativeRevision` ready for card cancel button
- Plan binding at proposal creation is verified by test `creates a creative_revision proposal with frozen planVersionId in payload`
- One-active-generation enforcement is verified by test `rejects when another generation is already running on lineage`
- Idempotency is verified by test `returns idempotent when actionId already produced a version`
- Plan 02 (UI) can render proposal cards with `payload.planVersionId`, `payload.intendedChanges`, `payload.format`, `payload.referenceIds`, `payload.creditImpact`, `payload.writes`
- Plan 04 (orchestrator + facade) can call `handleCreativeRevisionMessage` wrapper around `proposeCreativeRevision` and route variants through generic LLM fallback

---
*Phase: 205-creative-iteration-loop*
*Completed: 2026-06-28*

## Self-Check: PASSED

- FOUND: app/src/server/assistant/creative-iteration/types.ts
- FOUND: app/src/server/assistant/creative-iteration/intent.ts
- FOUND: app/src/server/assistant/creative-iteration/intent.test.ts
- FOUND: app/src/server/assistant/creative-iteration/draft.ts
- FOUND: app/src/server/assistant/creative-iteration/draft.test.ts
- FOUND: app/src/server/assistant/creative-iteration/proposal.ts
- FOUND: app/src/server/assistant/creative-iteration/proposal.test.ts
- FOUND: app/drizzle/0066_assistant_creative_feedback_drafts.sql
- FOUND: ef8e31a5
- FOUND: a8ecf29c
- FOUND: baa03545
