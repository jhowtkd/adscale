# Phase 205: Creative Iteration Loop - Research

**Researched:** 2026-06-27
**Domain:** Async credit-gated creative revision generation with idempotent confirm/callback/retry
**Confidence:** HIGH

## Summary

Phase 205 is the creative-side twin of Phase 204 (plan iteration). It reuses the exact same artifact-versioning substrate (`assistantArtifactLineages`/`Versions`/`Proposals`/`Heads`), the same action-card lifecycle (`pending` → `confirmed` → `running` → `completed`/`failed`/`canceled`), and the same proposal→confirm→child-version pattern. The `artifactProposalPayloadSchema` already ships a `creative_revision` variant with `intendedChanges`, `format`, `referenceIds`, `creditImpact`, and `writes` — so the proposal payload contract is **already defined and validated**. The `creativeVersionSnapshotSchema` already carries `derivationId` and `planVersionId`.

The differences from plan iteration are all on the generation side: (1) creative generation is **async** (Inngest `derivation.generate` job), (2) it is **credit-gated** (charge on confirm, before enqueue), (3) it must **auto-refund on job failure**, and (4) it must enforce **one active generation per creative lineage**. The existing `executeQuickRestyle` handler already demonstrates credit spend → derivation creation → Inngest enqueue → async `syncAssistantActionFromJob` callback, so the async wiring pattern is proven. The gaps are: a missing refund capability in the billing layer, a missing frozen-`planVersionId` storage slot on proposals, a missing creative-specific draft table, and a missing unified plan-vs-creative intent classifier in the orchestrator.

**Primary recommendation:** Build a `creative-iteration/` module that mirrors `plan-iteration/` (service/proposal/intent/digest/draft/types), add a `revise_creative` action contract + handler that combines `confirmPlanRevision`'s idempotent-confirm pattern with `executeQuickRestyle`'s charge→enqueue→async-callback pattern, add a `refundCredits` function to the billing layer, and insert a unified intent classifier in the orchestrator that routes to plan vs creative vs clarify before the generic LLM.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Creative revision target
- Default revision target is the thread's **working** creative version (mirrors plan "versão em trabalho").
- If no working creative is set but lineage/history exists, **ask the user** which creative/version to revise before proposing (differs from plan fallback-to-approved).
- If multiple creative lineages exist (e.g., 1:1 and 9:16), **ask which creative/format** to revise.
- When working creative differs from approved current, show an explicit warning on the proposal card (same pattern as Phase 204 plan revision).
- Block creative revision proposals until a plan lineage is adopted in the thread; explain that a plan must exist first.

#### Plan version binding
- Freeze `planVersionId` at **proposal creation**; generation uses that exact plan snapshot.
- If the working plan changes after the proposal was created, mark the creative proposal **stale**; user must refresh/recreate before confirm (server rejects stale confirm).
- Show the bound plan version label on the action card (e.g., "Plano: v2").

#### Feedback entry and routing
- Classify user intent **first** (plan revision vs creative revision vs generic/ambiguous) before calling handlers.
- Orchestrator order: classify → route to plan handler OR creative handler OR clarify → only then generic LLM.
- Ambiguous feedback ("melhora isso") triggers **one** clarifying question: plano or criativo?
- Use lightweight heuristics: visual keywords (cor, layout, imagem, fundo, foto, visual) → creative; plan-field keywords → plan (same family as Phase 204 intent).
- Mirror Phase 204 elsewhere unless overridden: free-text chat only, one message = one proposal, clarify vague feedback before proposing, server-persisted unsent drafts per thread, explicit proposal cancel, neutral/technical summary tone, PT-BR card copy when user locale is pt.

#### Proposal review
- Review surface is an action card in chat (v13.8 pattern), showing summary, intended visual changes, format, **listed references** (count + names/thumbnails when available), bound plan version label, write effects, and credit impact summary.
- Confirmation uses an explicit button (e.g., "Confirmar revisão do criativo"), not chat text alone.
- **Secondary confirmation modal** shows credit cost before final confirm (user chose modal over inline-only credit display).
- Stale proposals show warning but keep confirm visible; server must reject stale confirmation.
- Reject-and-retry via new feedback; no inline editing on the proposal card.

#### References and format
- Chat image attachments in the feedback turn are included in the proposal as visual references.
- Merge guided-journey references (from_zero) **and** chat attachments into the proposal reference list.
- Request for a different output format (e.g., "faz em 9:16") is **not** a creative_revision — redirect to format adaptation / new lineage per Phase 203 rules.

#### Async generation UX
- Reuse action-card lifecycle: `pending` → `confirmed`/`running` → `completed`/`failed`/`canceled` (same family as `quick_restyle`).
- On success, show preview in the thread when ready (message and/or updated card).
- User may continue chatting while generation runs in background.
- Reload restores card with real persisted job status (`running`/`completed`/`failed`).
- User may **cancel** an in-flight generation from the card; source creative remains current.
- At most **one active generation per creative lineage**; block new confirmation on that lineage while running.
- On failure, card moves to `failed` with safe error message and **retry** affordance.
- On success, new version is `ready`; working selection switches to it; approved current unchanged (promotion is Phase 206).

#### Credits and billing
- Show estimated credit impact before final confirm via **secondary modal** (in addition to card summary).
- **Charge credits on confirm**, before enqueueing the job, using idempotent key scoped to the action record.
- Block confirmation with clear message if insufficient credits; proposal stays `pending`.
- **Auto-refund credits** if the generation job fails after charge.
- Retry after refund **charges again** on retry confirm (consistent with re-execution).
- Retry on failed action is **idempotent on the same action record** — no duplicate charge for the same retry attempt key.

#### Failure, cancel, and idempotency (SAFE-02)
- Failed or canceled generation leaves source version as approved/working baseline per Phase 203 recovery rules.
- Retry reexecutes the **same action record** without creating duplicate charges/versions for the same attempt.
- Job/callback processing uses **idempotency key per actionId** to prevent duplicate child versions on double callback.
- User-initiated **cancel** does not offer retry on the same card; user must start a new proposal if they want another attempt.
- Duplicate confirmation, callback, or retry must not create duplicate charges, jobs, or versions.

#### Post-confirmation lifecycle
- Confirmation enqueues async generation; does not auto-approve the new creative.
- Approved current pointer unchanged until Phase 206 promotion.
- Other pending creative proposals on the same source become stale after one is confirmed (Phase 203 queue rules).

### Claude's Discretion
- Exact action contract name (`revise_creative` vs extend `quick_restyle`), handler split, and Inngest event shape.
- Credit pricing formula and modal copy.
- Intent classifier implementation (heuristics + optional LLM) and keyword lists.
- Creative proposal LLM prompt, `intendedChanges` extraction, and reference asset resolution.
- Draft persistence API path (separate `creative-revisions` route vs shared pattern).
- Exact preview rendering (thumbnail vs message attachment) in thread.
- Refund transaction implementation and retry charge timing inside confirm/retry handler.

### Deferred Ideas (OUT OF SCOPE)
- Auto-approve creative on generation success — Phase 206.
- Format change inside creative_revision — redirect to new lineage / adaptation flow.
- Inline credit display without modal — user chose secondary modal.
- Retry after user cancel on same card — rejected; new proposal required.
- Field-by-field visual diff UI — Phase 206 compare.
- Plan revision routing changes — owned by Phase 204.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CREV-01 | User feedback on a selected creative creates an inspectable revision proposal tied to the source creative. | `creative-iteration/proposal.ts` mirrors `plan-iteration/proposal.ts`; `artifactProposalPayloadSchema` `creative_revision` variant already defined in `app/src/lib/assistant/artifact-version.ts:94-105`; `createArtifactProposal` in `app/src/server/repositories/artifact-version.ts:364` accepts `proposalType: "creative_revision"`. |
| CREV-02 | User sees intended visual change, format, references, credit impact, and writes before confirming generation. | `creative_revision` payload already carries `intendedChanges`, `format`, `referenceIds`, `creditImpact`, `writes`; `AssistantActionCard.tsx` renders summary/writes/creditImpact — extend with references + plan version label; secondary modal is new client component. |
| CREV-03 | User confirmation generates a new creative version linked to the source creative and exact plan version. | `createArtifactVersion` in `app/src/server/repositories/artifact-version.ts:273` creates child version; `creativeVersionSnapshotSchema` carries `planVersionId` + `derivationId`; handler enqueues `derivation.generate` Inngest event (pattern from `executeQuickRestyle`); job callback creates version + updates head. |
| CREV-04 | Failed or canceled generation leaves the source version current and supports idempotent retry. | `syncAssistantActionFromJob` marks action `failed`; source head unchanged (only updated on success); retry re-enters confirm handler with idempotency guard (pattern from `confirmPlanRevision` `findVersionByActionId`); new `refundCredits` function reverses charge on failure. |
| SAFE-02 | Confirmations, credit spends, generation jobs, callbacks, and retries cannot create duplicate versions or charges. | Idempotency key `assistant-action:${actionId}:creative_revision` on `spendCreditsOrApiError`; `findVersionByActionId` guard before create; Inngest job idempotency check (`existing.outputKey` skip in `derivation.ts:327`); `transitionAssistantAction` validates status transitions; proposal transition state machine in `artifact-version.ts:89-94`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.0.0 | Schema validation for proposal payload, version snapshot, action input | Already used for `artifactProposalPayloadSchema`, `creativeVersionSnapshotSchema`, all action contracts |
| drizzle-orm | ^0.45.2 | DB queries (scoped lineage/version/proposal/head CRUD) | Existing repository pattern in `app/src/server/repositories/artifact-version.ts` |
| inngest | ^4.4.0 | Async job queue for image generation | `derivationJob` in `app/src/server/jobs/derivation.ts:240`; `inngest.send` pattern in `executeQuickRestyle` |
| @tanstack/react-query | ^5.100.1 | Client mutations (confirm/cancel) + query invalidation | `useConfirmAssistantAction`/`useCancelAssistantAction` in `app/src/lib/hooks/use-assistant-actions.ts` |
| vitest | ^4.1.5 | Unit/integration test framework | Config at `app/config/vitest.config.ts`; all `*.test.ts` colocated |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| openai | ^6.34.0 | LLM call for `intendedChanges` extraction from feedback | `getOpenAI()` pattern from `plan-iteration/proposal.ts:105` |
| next | 16.2.6 | API route handlers (confirm/cancel/draft) | Existing route pattern `app/src/app/api/assistant/actions/[actionId]/confirm/route.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `revise_creative` contract | Extend `quick_restyle` | quick_restyle is restyling-specific (base+style asset); creative revision is feedback-driven with plan binding + references — different input shape. Keep separate contract (Claude's discretion). |
| New `creative-iteration/` module | Extend `plan-iteration/` | Different generation path (async+credit vs sync), different source resolution (ask-when-ambiguous vs fallback), different draft table. Separate module mirrors the parallel structure the CONTEXT.md mandates. |
| New `refundCredits` billing function | Reuse `recordUsage` with negative amount | `recordUsage` debits grants; refund must credit grants back + create `type: "refund"` transaction. Different direction; needs its own function. |

**Installation:**
```bash
# No new packages required — all dependencies already installed.
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/server/assistant/
├── creative-iteration/          # NEW — mirrors plan-iteration/
│   ├── service.ts               # handleCreativeRevisionMessage (orchestrator entry)
│   ├── proposal.ts              # proposeCreativeRevision, confirmCreativeRevision, cancelCreativeRevision
│   ├── intent.ts                # classifyCreativeRevisionIntent (visual keywords)
│   ├── digest.ts                # canonicalCreativeProposalDigest (sha256)
│   ├── draft.ts                 # save/clear/getCreativeFeedbackDraft (new table)
│   ├── types.ts                 # CreativeRevisionResult, CreativeRevisionSource
│   ├── service.test.ts
│   ├── proposal.test.ts
│   ├── intent.test.ts
│   └── draft.test.ts
├── action-contracts/
│   └── contracts/
│       ├── revise-creative.ts   # NEW — reviseCreativeContract + inputSchema
│       └── index.ts             # register reviseCreativeContract
├── action-execution/
│   ├── handlers/
│   │   └── revise-creative.ts   # NEW — executeReviseCreative (charge → confirm → enqueue)
│   └── execute.ts               # add revise_creative: executeReviseCreative
├── orchestrator.ts              # MODIFIED — unified intent classify → route plan vs creative
└── plan-iteration/              # EXISTING (reference pattern)

app/src/server/billing/
├── credits.ts                   # MODIFIED — add refundCredits function
└── gates.ts                     # EXISTING (spendCreditsOrApiError)

app/src/server/repositories/
├── artifact-version.ts          # EXISTING (reuse createArtifactVersion, etc.)
└── assistant-job-sync.ts        # EXISTING (reuse syncAssistantActionFromJob)

app/src/components/assistant/
├── AssistantActionCard.tsx      # MODIFIED — render references + plan version label
└── CreditConfirmModal.tsx       # NEW — secondary confirmation modal

app/src/lib/hooks/
└── use-assistant-actions.ts     # EXISTING (reuse confirm/cancel mutations)

app/src/server/db/
└── schema.ts                    # MODIFIED — add assistantCreativeFeedbackDrafts table,
                                 #   add planVersionId column to assistantArtifactProposals
```

### Pattern 1: Proposal → Confirm → Child Version (mirror Phase 204)
**What:** Feedback creates a pending proposal (no mutation); explicit confirm creates an immutable child version linked to source + action.
**When to use:** All creative revision flows.
**Example:**
```typescript
// Source: app/src/server/assistant/plan-iteration/proposal.ts:221-316
// propose: classify feedback → resolve source → generate via LLM → createArtifactProposal → return result
// confirm: findVersionByActionId (idempotency guard) → validate proposal pending/digest/head →
//          createArtifactVersion → staleSiblingProposals → transitionArtifactProposal("confirmed") →
//          updateArtifactHead(workingVersionId)
```
**Creative difference:** Confirm does NOT create the version synchronously. It charges credits, enqueues the Inngest job, and leaves the action `running`. The version is created in the job callback on success.

### Pattern 2: Charge → Enqueue → Async Callback (mirror quick_restyle)
**What:** Handler charges credits with idempotency key, creates a derivation, enqueues Inngest job, returns `mode: "async"`. Job callback syncs action status via `syncAssistantActionFromJob`.
**When to use:** Confirmed creative revision generation.
**Example:**
```typescript
// Source: app/src/server/assistant/action-execution/handlers/quick-restyle.ts:106-175
const creditError = await spendCreditsOrApiError({
  workspaceId: ctx.workspaceId,
  action: "restyling",  // or new "creative_revision" action
  amount: 5,
  idempotencyKey: `assistant-action:${ctx.actionId}:creative_revision`,
  metadata: { actionId: ctx.actionId, campaignId, mode: "creative_revision" },
  userId: ctx.userId,
});
if (creditError) throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");

const derivation = await createDerivation({ /* ... status: "queued" */ });
await inngest.send({
  name: "derivation.generate",
  data: { derivationId: derivation.id, /* ... */ assistantActionId: ctx.actionId },
});
return { mode: "async", jobRef: { kind: "derivation", id: derivation.id }, resultSummary: "..." };
```

### Pattern 3: Idempotent Confirm (prevent duplicate versions/charges)
**What:** Before creating a version or charging, check if this actionId already produced a version/charge.
**When to use:** Confirm handler + job callback + retry.
**Example:**
```typescript
// Source: app/src/server/assistant/plan-iteration/proposal.ts:336-345
if (input.actionId) {
  const existing = await findVersionByActionId(scope, lineageId, input.actionId);
  if (existing) return { version: existing, idempotent: true };
}
// spendCreditsOrApiError is itself idempotent via getUsageByIdempotencyKey (credits.ts:199-205)
```

### Pattern 4: Scoped Repository Access (SAFE-01 inheritance)
**What:** Every query filters by `workspaceId + clientProfileId + campaignId + threadId`.
**When to use:** All artifact-version reads/writes.
**Example:**
```typescript
// Source: app/src/server/repositories/artifact-version.ts:103-125
const lineageScope = (scope: ArtifactScope) =>
  and(eq(...workspaceId), eq(...clientProfileId), eq(...campaignId), eq(...threadId));
```

### Pattern 5: Orchestrator Pre-LLM Branch
**What:** Before calling the LLM, classify intent and route to plan/creative/clarify handlers.
**When to use:** Every assistant turn with a campaign linked.
**Example:**
```typescript
// Source: app/src/server/assistant/orchestrator.ts:167-208
// CURRENT: classifyUserIntent → handlePlanRevisionMessage (plan only) → generic LLM
// PHASE 205: classifyRevisionIntent (plan vs creative vs ambiguous) →
//             handlePlanRevisionMessage OR handleCreativeRevisionMessage OR clarify → generic LLM
```

### Anti-Patterns to Avoid
- **Charging credits in the Inngest job:** Charge on confirm (synchronous, before enqueue) so insufficient-credits blocks before job starts. The job callback should only refund on failure, never charge.
- **Creating the creative version in the confirm handler:** The version requires `derivationId` + `outputKey` which only exist after generation. Create the version in the job success callback.
- **Updating `approvedCurrentVersionId` on success:** Phase 205 only updates `workingVersionId`. Promotion is Phase 206 (deferred).
- **Storing `planVersionId` only in payload:** The payload is the proposal; the frozen plan version must be queryable for stale-detection without parsing JSONB. Add a column OR keep in payload but ensure the stale-check reads it consistently.
- **Skipping the one-active-generation-per-lineage guard:** Without it, double-confirm or concurrent proposals can enqueue duplicate jobs on the same lineage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Proposal payload validation | Custom validation | `artifactProposalPayloadSchema` (`creative_revision` variant) | Already enforces `intendedChanges`, `format`, `referenceIds`, `creditImpact`, `writes` types + bounds |
| Version snapshot validation | Custom validation | `creativeVersionSnapshotSchema` | Already enforces `derivationId`, `planVersionId`, `format`, `outputKey` |
| Credit spend idempotency | Manual dedup table | `spendCreditsOrApiError` + `idempotencyKey` | `getUsageByIdempotencyKey` in `credits.ts:199` handles duplicates |
| Action status transitions | Custom state machine | `transitionAssistantAction` + `isValidActionTransition` | Validates `pending→confirmed→running→completed/failed/canceled` |
| Proposal status transitions | Custom logic | `transitionArtifactProposal` + `isValidProposalTransition` | Validates `pending→stale/confirmed/canceled` (`artifact-version.ts:89-94`) |
| Job→action status sync | Manual polling | `syncAssistantActionFromJob` | Maps `processing/completed/failed` → `running/completed/failed` + touches guided flow |
| Head concurrency | Manual locking | `updateArtifactHead` with `expectedRevision` CAS | Throws `ArtifactHeadConflictError` on race (`artifact-version.ts:314-362`) |
| Scope isolation | Manual filters | `assertArtifactScope` + scoped query helpers | Cross-workspace/client/campaign/thread rejection built-in |

**Key insight:** The artifact-versioning repository (`app/src/server/repositories/artifact-version.ts`) is a complete, tested CRUD layer. Phase 205 reuses it almost entirely — the new code is the creative-specific proposal/confirm logic, the refund function, the intent classifier, and the UI additions.

## Common Pitfalls

### Pitfall 1: No refund capability exists yet
**What goes wrong:** CONTEXT.md mandates "auto-refund credits if generation job fails after charge," but the billing layer has no `refundCredits` function. `recordUsage` only debits. The `derivationJob.onFailure` handler (`derivation.ts:244-301`) marks the derivation failed but does NOT refund.
**Why it happens:** The existing quick actions (restyle, regenerate) charge on their own API routes and never refund on failure — this is accepted tech debt. Phase 205 raises the bar.
**How to avoid:** Build `refundCredits({ workspaceId, action, idempotencyKey, amount, userId, metadata })` in `app/src/server/billing/credits.ts` that: (1) credits grants back via `updateCreditGrantRemaining`, (2) creates a `type: "refund"` credit transaction via `createCreditTransaction` (already supports `"refund"` — `credit-transactions.ts:11`), (3) is idempotent via a refund-specific idempotency key (e.g., `assistant-action:${actionId}:refund`). Call it from `derivationJob.onFailure` when `assistantActionId` is present and the action was a `revise_creative`.
**Warning signs:** Job fails, credits stay debited, user can't retry without re-charging on top of the lost credits.

### Pitfall 2: Frozen planVersionId has no storage column
**What goes wrong:** The decision "freeze planVersionId at proposal creation" requires persisting the bound plan version. `assistantArtifactProposals` schema (`schema.ts:2407-2429`) has no `planVersionId` column. The `creative_revision` payload schema also has no `planVersionId` field.
**Why it happens:** Phase 204 (plan revision) didn't need plan binding. Phase 205 is the first to cross-reference plan + creative.
**How to avoid:** Either (a) add `planVersionId uuid` column to `assistantArtifactProposals` + migration, OR (b) extend the `creative_revision` payload variant in `artifactProposalPayloadSchema` to include `planVersionId: z.string().uuid()`. Option (a) is queryable for stale-detection; option (b) keeps it in JSONB. Recommend (a) for indexable stale-checks, but (b) avoids a migration. The planner should pick based on whether stale-detection queries by planVersionId need DB-level filtering.
**Warning signs:** Working plan changes, old creative proposal confirms against the new plan snapshot instead of the frozen one.

### Pitfall 3: One-active-generation-per-lineage race
**What goes wrong:** Two proposals on the same lineage confirm concurrently; both enqueue jobs.
**Why it happens:** The `pending` proposal state doesn't block concurrent confirms. `assertNoQueuedDerivations` in `quick-restyle.ts:47` checks by campaign, not by lineage.
**How to avoid:** In the confirm handler, check for an existing `running`/`confirmed` action on the same lineage (query `assistantArtifactProposals` joined with action status, or check lineage head for an in-flight derivation). Use the `updateArtifactHead` CAS pattern or a lineage-level lock. Alternatively, transition sibling proposals to `stale` on confirm (already done via `staleSiblingProposals`) and reject confirm on stale proposals.
**Warning signs:** Two creative versions created from the same source for the same confirm attempt.

### Pitfall 4: Draft table is plan-specific
**What goes wrong:** `assistantPlanFeedbackDrafts` (`schema.ts:2379`) is named/placed for plan drafts. Reusing it for creative drafts conflates the two feedback types.
**Why it happens:** Phase 204 created a plan-specific table.
**How to avoid:** Create `assistantCreativeFeedbackDrafts` table (parallel structure) OR add a `draftType` discriminator column to the existing table. Recommend a separate table for clarity (Claude's discretion on draft persistence API path).
**Warning signs:** Plan draft overwritten by creative draft or vice versa on same thread.

### Pitfall 5: Intent classifier order in orchestrator
**What goes wrong:** Current orchestrator calls `handlePlanRevisionMessage` first for all campaign messages. Creative feedback with plan-ish keywords gets routed to plan handler.
**Why it happens:** `classifyPlanRevisionIntent` (`plan-iteration/intent.ts:16`) matches generic revision keywords (`revis|ajust|mud|alter|troc`) that overlap with creative feedback.
**How to avoid:** Insert a unified `classifyRevisionIntent(message)` that returns `plan | creative | ambiguous | continue` BEFORE the plan handler. Visual keywords (`cor|layout|imagem|fundo|foto|visual`) → creative; plan-field keywords (`estratégia|ângulo|hook|cta|restr`) → plan; both/neither → ambiguous → one clarifying question. Call this in `orchestrator.ts` before `handlePlanRevisionMessage`.
**Warning signs:** "Muda a cor de fundo" creates a plan revision instead of a creative revision.

## Code Examples

### Creative revision proposal payload (already defined)
```typescript
// Source: app/src/lib/assistant/artifact-version.ts:94-105
z.object({
  type: z.literal("creative_revision"),
  schemaVersion: z.literal(1),
  summary: z.string().trim().min(1).max(1_000),
  intendedChanges: boundedTextList,          // string[].max(50)
  format: z.string().trim().max(50).nullable(),
  referenceIds: z.array(z.string().uuid()).max(50),
  creditImpact: z.number().int().nonnegative(),
  writes: boundedTextList,
}).strict()
```

### Creative version snapshot (already defined)
```typescript
// Source: app/src/lib/assistant/artifact-version.ts:26-36
z.object({
  type: z.literal("creative"),
  derivationId: z.string().uuid(),
  outputKey: z.string().trim().min(1).max(1_024).nullable(),
  format: z.string().trim().max(50).nullable(),
  generationMode: z.string().trim().max(100).nullable(),
  ctaText: z.string().trim().max(500).nullable(),
  planVersionId: z.string().uuid().nullable(),
}).strict()
```

### Idempotent confirm with version guard (pattern to replicate)
```typescript
// Source: app/src/server/assistant/plan-iteration/proposal.ts:336-345
if (input.actionId) {
  const existing = await findVersionByActionId(input.scope, input.lineageId, input.actionId);
  if (existing) {
    return { version: existing, head: null, proposal: null, idempotent: true as const };
  }
}
```

### Action contract registration (pattern to replicate)
```typescript
// Source: app/src/server/assistant/action-contracts/contracts/revise-creative-plan.ts
export const reviseCreativeInputSchema = z.object({
  proposalId: z.string().uuid(),
  lineageId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  payloadDigest: z.string().length(64),
  lineageHeadRevision: z.number().int().min(0).optional(),
  planVersionId: z.string().uuid(),  // NEW for creative binding
}).strict();

export const reviseCreativeContract: ActionContract<typeof reviseCreativeInputSchema> = {
  actionType: "revise_creative",
  intentFamily: "complete_campaign",
  label: "Confirmar revisão do criativo",
  inputSchema: reviseCreativeInputSchema,
  requiredFields: ["proposalId", "lineageId", "sourceVersionId", "payloadDigest", "planVersionId"],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "medium",
  creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
  confirmationPolicy: "required",
};
```

### Refund function (new — pattern from recordUsage reversed)
```typescript
// To build in app/src/server/billing/credits.ts
export async function refundCredits(input: {
  workspaceId: string;
  action: CreditAction;
  idempotencyKey: string;  // e.g., `assistant-action:${actionId}:refund`
  amount?: number;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<{ status: "refunded" | "duplicate" }> {
  // 1. Check idempotency (getUsageByIdempotencyKey or separate refund tracking)
  // 2. Credit grants back: updateCreditGrantRemaining(grant.id, grant.remaining + refundAmount)
  // 3. createCreditTransaction({ ..., amount: +refundAmount, type: "refund" })
  // 4. Record usage with negative amount OR separate refund log
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plan iteration only (Phase 204) | Plan + creative iteration (Phase 205) | 2026-06-27 | Creative feedback now produces inspectable proposals, not just plan revisions |
| Quick actions charge without refund | Credit-gated with auto-refund on failure | Phase 205 | First refund capability in the billing layer |
| Single intent classifier (plan-only) | Unified plan-vs-creative classifier | Phase 205 | Orchestrator routes feedback to correct handler before LLM |
| `quick_restyle` as only creative generation | `revise_creative` as feedback-driven generation with plan binding | Phase 205 | Generation tied to exact plan version + source creative version |

**Deprecated/outdated:**
- `classifyPlanRevisionIntent` as the sole pre-LLM classifier — superseded by unified classifier (but kept for plan-specific sub-classification).

## Open Questions

1. **Where to store frozen `planVersionId`?**
   - What we know: It must be frozen at proposal creation and queryable for stale-detection.
   - What's unclear: Column on `assistantArtifactProposals` (queryable, needs migration) vs field in `creative_revision` payload (no migration, JSONB parse for stale-check).
   - Recommendation: Add `planVersionId` to the `creative_revision` payload variant (avoids migration, consistent with `creditImpact`/`referenceIds` already in payload). Stale-check reads payload.planVersionId. If performance becomes an issue, add column later.

2. **Should `refundCredits` live in `credits.ts` or `gates.ts`?**
   - What we know: `spendCreditsOrApiError` is in `gates.ts`, `recordUsage` (the debit logic) is in `credits.ts`.
   - What's unclear: Whether refund should be an API-error-returning gate or a pure credits function.
   - Recommendation: Put `refundCredits` in `credits.ts` (pure function, returns status). The handler/job calls it directly; it doesn't need to return a NextResponse.

3. **Does the derivation job need modification, or can the refund happen in a new onFailure hook?**
   - What we know: `derivationJob.onFailure` (`derivation.ts:244`) already handles failure cleanup.
   - What's unclear: Whether to modify the existing job or add a separate refund step.
   - Recommendation: Add a `refund-on-failure` step in the existing `onFailure` handler, gated on `assistantActionId` presence + action type check. This keeps failure handling in one place.

4. **Credit action type for creative revision**
   - What we know: `CREDIT_COSTS` (`credits.ts:27-36`) has `image_derivation: 5`, `regeneration: 5`, `restyling: 5`.
   - What's unclear: Whether to reuse `image_derivation` or add `creative_revision: 5`.
   - Recommendation: Reuse `image_derivation` (the generation is an image derivation). The idempotency key + metadata distinguish it. Adding a new CreditAction is optional and Claude's discretion.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 + @testing-library/react 16.3.2 (component) + Playwright 1.60.0 (E2E, separate) |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `npx vitest run app/src/server/assistant/creative-iteration/ --config app/config/vitest.config.ts` |
| Full suite command | `npm test` (runs `vitest run --config config/vitest.config.ts --passWithNoTests`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CREV-01 | Feedback creates pending creative proposal tied to source creative; clarifies vague feedback; redirects format-change requests; asks which creative when ambiguous/multiple lineages; blocks until plan lineage exists | unit | `npx vitest run app/src/server/assistant/creative-iteration/proposal.test.ts -t "proposeCreativeRevision"` | ❌ Wave 0 |
| CREV-01 | Intent classifier routes visual keywords → creative, plan keywords → plan, ambiguous → clarify | unit | `npx vitest run app/src/server/assistant/creative-iteration/intent.test.ts` | ❌ Wave 0 |
| CREV-01 | Orchestrator routes to creative handler when intent is creative | unit | `npx vitest run app/src/server/assistant/orchestrator.test.ts -t "creative"` | ❌ Wave 0 (extend existing) |
| CREV-02 | Action card displays summary, intendedChanges, format, references count, plan version label, credit impact, writes | component | `npx vitest run app/src/components/assistant/AssistantActionCard.test.tsx -t "creative"` | ❌ Wave 0 (extend existing) |
| CREV-02 | Secondary credit confirmation modal shows cost before final confirm | component | `npx vitest run app/src/components/assistant/CreditConfirmModal.test.tsx` | ❌ Wave 0 |
| CREV-03 | Confirm handler charges credits, enqueues Inngest job, returns async; job callback creates child version linked to source + planVersionId | unit | `npx vitest run app/src/server/assistant/action-execution/handlers/revise-creative.test.ts` | ❌ Wave 0 |
| CREV-03 | Job success creates creative version with `derivationId` + `planVersionId`, updates working head | integration | `npx vitest run app/src/server/jobs/derivation.test.ts -t "creative revision"` | ❌ Wave 0 (extend existing) |
| CREV-04 | Job failure marks action failed, refunds credits, leaves source current | unit | `npx vitest run app/src/server/billing/credits.test.ts -t "refundCredits"` | ❌ Wave 0 (extend existing) |
| CREV-04 | Cancel in-flight generation leaves source current, no retry on same card | unit | `npx vitest run app/src/server/assistant/creative-iteration/proposal.test.ts -t "cancel"` | ❌ Wave 0 |
| SAFE-02 | Duplicate confirm returns idempotent (no duplicate version/charge/job) | unit | `npx vitest run app/src/server/assistant/creative-iteration/proposal.test.ts -t "idempotent"` | ❌ Wave 0 |
| SAFE-02 | Duplicate Inngest callback does not create duplicate version (job idempotency check) | integration | `npx vitest run app/src/server/jobs/derivation.test.ts -t "idempotency"` | ❌ Wave 0 (extend existing) |
| SAFE-02 | Retry charges again on same action record with new attempt key; no duplicate for same attempt | unit | `npx vitest run app/src/server/assistant/action-execution/handlers/revise-creative.test.ts -t "retry"` | ❌ Wave 0 |
| SAFE-02 | One active generation per lineage; concurrent confirm blocked | unit | `npx vitest run app/src/server/assistant/creative-iteration/proposal.test.ts -t "one active"` | ❌ Wave 0 |
| SAFE-02 | Reload restores pending proposals, generation status, drafts, working/approved pointers | integration | `npx vitest run app/src/server/assistant/artifact-version/service.test.ts -t "creative"` | ❌ Wave 0 (extend existing) |
| CREV-01..04 | API routes: confirm, cancel, draft persistence | unit | `npx vitest run app/src/app/api/assistant/actions/[actionId]/confirm/route.test.ts -t "creative"` | ❌ Wave 0 (extend existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run app/src/server/assistant/creative-iteration/ app/src/server/billing/credits.test.ts app/src/components/assistant/ --config app/config/vitest.config.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `$gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/src/server/assistant/creative-iteration/proposal.test.ts` — covers CREV-01, CREV-04, SAFE-02 (propose, confirm idempotent, cancel, one-active)
- [ ] `app/src/server/assistant/creative-iteration/intent.test.ts` — covers CREV-01 (visual vs plan keyword routing)
- [ ] `app/src/server/assistant/creative-iteration/service.test.ts` — covers CREV-01 (orchestrator entry, clarify/redirect/ask_target)
- [ ] `app/src/server/assistant/creative-iteration/draft.test.ts` — covers draft persistence
- [ ] `app/src/server/assistant/action-execution/handlers/revise-creative.test.ts` — covers CREV-03, SAFE-02 (charge, enqueue, idempotent, retry)
- [ ] `app/src/server/billing/credits.test.ts` — extend with `refundCredits` tests (CREV-04, SAFE-02)
- [ ] `app/src/components/assistant/CreditConfirmModal.test.tsx` — covers CREV-02 (secondary modal)
- [ ] `app/src/components/assistant/AssistantActionCard.test.tsx` — extend with creative revision display tests (CREV-02)
- [ ] `app/src/server/assistant/orchestrator.test.ts` — extend with unified intent routing tests (CREV-01)
- [ ] `app/src/server/jobs/derivation.test.ts` — extend with creative revision callback + refund-on-failure tests (CREV-03, CREV-04, SAFE-02)
- [ ] `app/src/server/assistant/artifact-version/service.test.ts` — extend with creative lineage reload tests (CREV-04, SAFE-02)
- [ ] DB migration for `assistantCreativeFeedbackDrafts` table (+ optional `planVersionId` column on proposals)

## Sources

### Primary (HIGH confidence)
- `app/src/lib/assistant/artifact-version.ts` — `artifactProposalPayloadSchema` (creative_revision variant), `creativeVersionSnapshotSchema`, `artifactVersionPresentationSchema`
- `app/src/server/repositories/artifact-version.ts` — `createArtifactVersion`, `createArtifactProposal`, `transitionArtifactProposal`, `staleSiblingProposals`, `updateArtifactHead` (CAS), `assertArtifactScope`
- `app/src/server/assistant/plan-iteration/proposal.ts` — `proposePlanRevision`, `confirmPlanRevision` (idempotent pattern), `cancelPlanRevision`, `resolvePlanRevisionSource`
- `app/src/server/assistant/plan-iteration/service.ts` — `handlePlanRevisionMessage`, `buildReviseCreativePlanActionDisplay`
- `app/src/server/assistant/plan-iteration/intent.ts` — `classifyPlanRevisionIntent`
- `app/src/server/assistant/plan-iteration/digest.ts` — `canonicalProposalPayloadDigest`
- `app/src/server/assistant/plan-iteration/draft.ts` — `savePlanFeedbackDraft`, `clearPlanFeedbackDraft`, `getPlanFeedbackDraft`
- `app/src/server/assistant/action-execution/handlers/quick-restyle.ts` — `executeQuickRestyle` (charge → enqueue → async)
- `app/src/server/assistant/action-execution/handlers/revise-creative-plan.ts` — `executeReviseCreativePlan` (sync confirm handler)
- `app/src/server/assistant/action-execution/execute.ts` — `executeConfirmedAssistantAction`, HANDLERS map
- `app/src/server/assistant/action-contracts/contracts/revise-creative-plan.ts` — contract pattern
- `app/src/server/assistant/action-contracts/contracts/quick-restyle.ts` — creditAction contract pattern
- `app/src/server/assistant/action-contracts/validate.ts` — `validateProposeAction`, `revalidateOnConfirm`
- `app/src/server/assistant/orchestrator.ts` — `runAssistantTurn`, pre-LLM branching
- `app/src/server/assistant/artifact-version/service.ts` — `getThreadArtifactVersionState`, `adoptArtifactForThread`, `getLineagePresentation`
- `app/src/server/jobs/derivation.ts` — `derivationJob` (Inngest), `onFailure` handler, `syncAssistantActionFromJob` calls
- `app/src/server/repositories/assistant-job-sync.ts` — `syncAssistantActionFromJob`
- `app/src/server/billing/credits.ts` — `recordUsage`, `canSpend`, `CREDIT_COSTS` (NO refund function — gap)
- `app/src/server/billing/gates.ts` — `spendCreditsOrApiError`
- `app/src/server/repositories/credit-transactions.ts` — `createCreditTransaction` (supports `type: "refund"`)
- `app/src/server/db/schema.ts:2322-2429` — `assistantArtifactLineages`, `assistantArtifactVersions`, `assistantArtifactLineageHeads`, `assistantPlanFeedbackDrafts`, `assistantArtifactProposals` (no planVersionId column — gap)
- `app/src/components/assistant/AssistantActionCard.tsx` — card rendering pattern
- `app/src/lib/hooks/use-assistant-actions.ts` — `useConfirmAssistantAction`, `useCancelAssistantAction`
- `app/src/app/api/assistant/actions/[actionId]/confirm/route.ts` — confirm route
- `app/src/app/api/assistant/artifact-proposals/[proposalId]/cancel/route.ts` — cancel route
- `app/config/vitest.config.ts` — test config
- `app/package.json` — vitest 4.1.5, inngest 4.4.0, zod 3, drizzle-orm 0.45.2

### Secondary (MEDIUM confidence)
- `app/src/server/assistant/plan-iteration/proposal.test.ts` — test pattern for propose/confirm/cancel (mock repository layer)
- `app/src/server/assistant/plan-iteration/service.test.ts` — test pattern for orchestrator entry (mock intent/proposal/validate/createAction)

### Tertiary (LOW confidence)
- None — all findings verified against actual source files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in `package.json`, all schemas/handlers read from source
- Architecture: HIGH — Phase 204 module structure and quick_restyle handler read in full; patterns confirmed by tests
- Pitfalls: HIGH — refund gap and planVersionId gap confirmed by reading billing + schema source; no refund function exists, no planVersionId column exists
- Validation: HIGH — vitest config read, test patterns confirmed from existing `*.test.ts` files

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (30 days — stable internal codebase, no external API dependencies)
