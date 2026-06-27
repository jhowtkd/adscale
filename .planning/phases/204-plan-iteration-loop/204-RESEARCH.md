# Phase 204: Plan Iteration Loop - Research

**Researched:** 2026-06-27
**Domain:** Conversational plan revision proposals, action-card confirmation, immutable artifact versions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Feedback entry
- Users trigger plan revision with free text in chat only; no structured quick-action buttons in this phase.
- Feedback applies to the thread's working plan version by default.
- If no plan is in focus, the assistant asks which plan/version to revise before proposing.
- If feedback is vague, the assistant may ask 1–2 clarifying questions before creating a proposal; do not single-shot a proposal from ambiguous input.
- Each feedback message creates a separate proposal; do not accumulate multiple messages into one proposal or auto-replace a prior pending proposal on the same source.
- Scope is plan fields only: strategy, angles, hooks, CTAs, constraints. Requests outside that scope redirect back to the guided journey or appropriate flow.
- If no working version is set but history exists, fall back to the approved current version as the revision source.
- The proposal appears in the same assistant turn as the generation response; no async "generating proposal" card.
- When working version differs from approved current, warn explicitly (e.g., "you are revising v2; approved is v1").
- Unsent feedback drafts persist on the server scoped to the thread (refines Phase 203 local-only draft note); they are not confirmed feedback or proposals.
- Users can explicitly cancel/discard a pending proposal.
- Proposal summary tone is neutral/technical, not mirroring the user's wording.

#### Proposal review
- Review surface is an action card in chat, reusing the v13.8 action-card pattern.
- Before confirmation, show summary-only narrative; field-by-field before/after diff is deferred to Phase 206.
- If the user dislikes the proposal, reject and send new feedback; no inline field editing on the proposal card.
- Confirmation uses an explicit button (e.g., "Confirmar revisão do plano"), not chat text alone.
- The card shows the source version label (e.g., "Revisando v2 do plano").
- The card lists write effects at confirm time (e.g., creates v3, does not change approved current).
- Stale proposals show a warning but keep the confirm affordance visible; the server must still reject stale confirmation per Phase 203 rules.
- Summary and card copy are in PT-BR when that is the user's locale.

#### Post-confirmation lifecycle
- Confirmation creates a new immutable child plan version in `ready` status; it does not auto-approve.
- Working selection switches to the newly confirmed version.
- Approved current pointer stays unchanged; promotion belongs to Phase 206.
- The mutable `creative_plans` campaign row does not update on confirmation; only immutable version snapshots change until promotion.

#### Credits
- Plan revision is free: neither proposal generation nor confirmation spends credits.
- Do not show credit copy on the card when cost is zero.
- If pricing changes later, confirmation must remain idempotent.

### Claude's Discretion
- Exact action contract name, command envelope, and orchestrator/tool wiring.
- LLM prompt for proposal generation and semantic change extraction into `artifactProposalPayloadSchema`.
- Server-side draft persistence shape and API (table vs. guided-flow extension).
- Exact stale-card warning copy and refresh behavior after server rejection.
- Clarification turn limit enforcement and when to stop asking and propose anyway.

### Deferred Ideas (OUT OF SCOPE)
- Structured quick actions ("Ajustar CTA", "Novo ângulo") — future UX enhancement.
- Field-by-field before/after diff in review card — Phase 206 compare UI.
- Inline editing of proposed plan fields — rejected; use reject-and-retry feedback loop.
- Briefing/campaign field changes via plan revision — redirect to guided journey.
- Credit charging for plan revisions — explicitly deferred; remain free in v13.9.
- Syncing mutable `creative_plans` on confirm — deferred to Phase 206 promotion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAN-01 | User feedback creates a proposed plan revision without changing the current approved plan | `createArtifactProposal` + `artifactProposalPayloadSchema` (`plan_revision`); confirmation handler must not touch `approvedCurrentVersionId` or `creative_plans` |
| PLAN-02 | User can review semantic plan changes before confirming any write | Action card with `summary`, `changes[]`, `writes[]` from payload; extend `AssistantActionCard` display for plan-revision fields |
| PLAN-03 | User confirmation creates a new immutable plan version linked to its source version | `createArtifactVersion` with `sourceVersionId`, `origin: revision`, `actionId`/`messageId` provenance; transactional confirm in new execution handler |
| PLAN-04 | Each plan version preserves strategy, angles, hooks, CTAs, constraints, and source feedback as typed provenance | `planVersionSnapshotSchema` + bounded `feedback` column + `artifactVersionProvenanceSchema` with `origin: revision` |
</phase_requirements>

## Executive Summary

Phase 204 closes the loop between chat feedback and immutable plan versions. Phase 203 already delivers lineage identity, head pointers (`approvedCurrent` / `working`), proposal persistence, stale transitions, and thread reload projection via `getThreadArtifactVersionState`. This phase adds **semantic proposal authoring**, **clarification turns**, **action-card review**, and **confirm-to-version** execution — without mutating the approved current pointer or the mutable `creative_plans` row.

No new npm dependencies are required. [VERIFIED: codebase grep] The stack is existing Drizzle repositories, Zod contracts, Vitest, the v13.8 `propose_action` → action card → `confirm` → handler pipeline, and the existing OpenAI client used by `executeCreateCreativePlan`.

**Primary recommendation:** Add a `plan-iteration` service module, a `revise_creative_plan` action contract, orchestrator pre-routing for plan-feedback intent, and a sync confirmation handler that atomically creates a `ready` child version, marks the proposal `confirmed`, stale-marks siblings, and CAS-updates `workingVersionId` only.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feedback intent detection & clarification | API / Backend (orchestrator) | — | Server owns routing; model must not directly mutate versions |
| LLM proposal generation | API / Backend | — | Calls OpenAI; output parsed into allowlisted `artifactProposalPayloadSchema` |
| Proposal persistence | Database / Storage | API | `assistant_artifact_proposals` via repository |
| Action-card review UX | Browser / Client | — | Reuses `AssistantActionCard`; renders server-built display |
| Confirm binding & stale rejection | API / Backend | Database | `revalidateOnConfirm` + head/proposal CAS inside transaction |
| Child version creation | Database / Storage | API | `createArtifactVersion` immutable insert |
| Working pointer update | Database / Storage | API | `updateArtifactHead` CAS; approved pointer unchanged |
| Reload/resume state | API / Backend | Browser | Existing thread GET already includes `artifactVersionState` |
| Unsent feedback drafts | Database / Storage | API | New thread-scoped draft store (planner discretion) |
| Approved current / `creative_plans` | Database / Storage | — | **Untouched** in Phase 204 (Phase 206 promotion) |

## Existing Foundation

### Phase 203 artifacts (ready to use)

| Asset | Location | Phase 204 use |
|-------|----------|---------------|
| `artifactProposalPayloadSchema` (`plan_revision`) | `app/src/lib/assistant/artifact-version.ts` | Canonical proposal shape: `summary`, `proposedSnapshot`, `changes[]`, `writes[]` |
| `planVersionSnapshotSchema` | same | Source + proposed field allowlist |
| `createArtifactProposal`, `listArtifactProposals`, `transitionArtifactProposal`, `staleSiblingProposals` | `app/src/server/repositories/artifact-version.ts` | Persist/query/mark proposals |
| `createArtifactVersion`, `updateArtifactHead` | same | Child version + working pointer |
| `getThreadArtifactVersionState`, `adoptArtifactForThread` | `app/src/server/assistant/artifact-version/service.ts` | Resolve lineage; reload projection |
| `buildPlanSnapshot` | `app/src/server/assistant/artifact-version/snapshots.ts` | Normalize source snapshot before LLM |
| Thread GET projection | `app/src/app/api/assistant/threads/[threadId]/route.ts` | Already returns `artifactVersionState` with `pendingProposals` |

### v13.8 action-card pipeline (precedent)

| Step | Module | Pattern |
|------|--------|---------|
| Propose | `tools/stubs/propose-action.ts` | `validateProposeAction` → `createAssistantAction` → SSE `action_card` event |
| Display | `AssistantActionCard.tsx` | Reads `payload.display` (label, risk, credit, riskCopyLines) |
| Confirm | `api/assistant/actions/[actionId]/confirm/route.ts` | `revalidateOnConfirm` → `confirmAssistantAction` → `executeConfirmedAssistantAction` |
| Execute | `action-execution/execute.ts` | Handler map keyed by `actionType` |

Guided-journey actions bind to `sourceFlowRevision` + `guidedActionSnapshotDigest` (`guided-binding.ts`). Plan revision must **not** use `assertGuidedActionReady`; it needs a parallel **artifact proposal digest** binding instead. [VERIFIED: `validate.ts` lines 115–136]

### Gaps (not yet implemented)

- No `revise_creative_plan` contract or handler [VERIFIED: `action-contracts/contracts/index.ts`]
- No plan-revision intent routing in orchestrator [VERIFIED: `orchestrator.ts`, `intent-classifier.ts`]
- No LLM prompt for revision / change extraction [VERIFIED: `prompt-builder.ts` has `buildPlanPrompt` only for initial creation]
- No server-side feedback draft persistence [VERIFIED: grep — no draft table/API]
- `AssistantActionCard` has no plan-revision-specific fields (summary, changes, source version label, stale warning)
- `revalidateOnConfirm` has no proposal/head-revision stale checks for iteration actions

## Recommended Architecture

### System flow

```text
User free-text feedback (chat)
  → orchestrator: classify plan-revision intent
      ├─ clarify (1–2 turns) → assistant message, no proposal
      ├─ out-of-scope → redirect message
      └─ ready
          → plan-iteration service
              1. resolve plan lineage + source version (working → approved fallback)
              2. adopt lineage if needed (lazy legacy)
              3. LLM: current snapshot + feedback → plan_revision payload
              4. createArtifactProposal (status pending)
              5. propose_action (revise_creative_plan) with artifact binding digest
          → same turn: assistant text + action_card SSE
User clicks Confirmar revisão do plano
  → revalidateOnConfirm (proposal + head revision + digest)
  → confirmAssistantAction
  → executeReviseCreativePlan (sync)
      transaction:
        - verify proposal pending + sourceVersionId matches
        - createArtifactVersion (status ready, provenance revision, feedback)
        - transitionArtifactProposal → confirmed
        - staleSiblingProposals (same source)
        - updateArtifactHead (workingVersionId = new, revision CAS)
        - approvedCurrentVersionId unchanged
        - creative_plans row unchanged
  → thread reload shows new working version + proposal confirmed
```

### 1. Proposal service (`app/src/server/assistant/plan-iteration/service.ts`)

**Responsibilities:**
- `resolvePlanRevisionSource(scope, lineageId?)` — pick `workingVersionId` from head, else `approvedCurrentVersionId`, else error/ask user
- `generatePlanRevisionProposal({ scope, sourceVersion, feedback, locale })` — LLM call + Zod parse into `artifactProposalPayloadSchema`
- `createPlanRevisionProposalRecord(...)` — wrap `createArtifactProposal` with `proposalType: plan_revision`
- `cancelPlanRevisionProposal(proposalId)` — `transitionArtifactProposal` → `canceled`
- `confirmPlanRevision(...)` — called from action handler; owns the transactional version creation

**Source version resolution** [from CONTEXT.md]:

```typescript
// Pseudocode — planner implements
const head = await getArtifactHead(scope, lineageId);
const sourceId = head?.workingVersionId ?? head?.approvedCurrentVersionId;
if (!sourceId) throw or askWhichPlan();
const source = await getArtifactVersion(scope, sourceId);
// Warn in assistant text + card display when working !== approved
```

**Multiple pending proposals:** CONTEXT forbids auto-replacing prior pending proposals on the same source. Each feedback message calls `createArtifactProposal` independently; `staleSiblingProposals` runs only on **confirmation**, not on new proposal creation.

### 2. Action contract: `revise_creative_plan`

Recommend this name — matches `.planning/research/ARCHITECTURE.md` and distinguishes from initial `create_creative_plan`. [VERIFIED: ARCHITECTURE.md line 28]

```typescript
// app/src/server/assistant/action-contracts/contracts/revise-creative-plan.ts
export const reviseCreativePlanInputSchema = z.object({
  proposalId: z.string().uuid(),
  lineageId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  sourceVersionNumber: z.number().int().positive(),
  lineageHeadRevision: z.number().int().min(0),
  proposalDigest: z.string().min(64).max(64), // sha256 hex
}).strict();

export const reviseCreativePlanContract: ActionContract = {
  actionType: "revise_creative_plan",
  intentFamily: "complete_campaign",
  label: "Confirmar revisão do plano", // locale via display at propose time
  inputSchema: reviseCreativePlanInputSchema,
  requiredFields: ["proposalId", "lineageId", "sourceVersionId", "sourceVersionNumber", "lineageHeadRevision", "proposalDigest"],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "medium",
  creditImpact: { kind: "fixed", credits: 0 }, // hide credit row in UI when 0
  confirmationPolicy: "required",
};
```

**Display payload extensions** (stored in action card `display`, not `inputSnapshot`):

```typescript
{
  label: "Confirmar revisão do plano",
  actionType: "revise_creative_plan",
  riskLabel: "medium",
  creditImpact: { kind: "fixed", credits: 0 },
  confirmationPolicy: "required",
  planRevision: {
    summary: string,
    changes: { field: string; description: string }[],
    writes: string[],
    sourceVersionLabel: "v2",
    approvedVersionLabel: "v1" | null,
    workingDiffersFromApproved: boolean,
    staleWarning: string | null,
  },
}
```

Extend `parseActionCardDisplay` / `AssistantActionCard` to render `planRevision` block; omit credit section when `credits === 0`.

### 3. Artifact proposal digest (parallel to guided binding)

```typescript
// app/src/server/assistant/plan-iteration/binding.ts
export function artifactProposalDigest(input: {
  proposalId: string;
  lineageId: string;
  sourceVersionId: string;
  lineageHeadRevision: number;
  payload: ArtifactProposalPayload;
}): string {
  return createHash("sha256").update(stable(input)).digest("hex");
}
```

Store digest in `assistant_action_records.sourceSnapshotDigest` (reuse column) with `sourceFlowRevision: null`. Extend `revalidateOnConfirm` with a third branch:

- If `sourceFlowRevision` set → existing guided binding
- Else if `sourceSnapshotDigest` set and `actionType === revise_creative_plan` → verify proposal still `pending`, `sourceVersionId` matches, head `revision` matches, digest matches
- Else → allow (quick actions)

On stale: return `stale_plan_revision` validation error; client refreshes thread and shows server message on card.

### 4. Commands (typed server envelope)

**Recommendation:** Add a small `planIterationCommandSchema` separate from `guidedCommandSchema` to avoid overloading journey transitions. [ASSUMED: preferred over extending guided-flow commands — journey may be `completed` while user iterates plan]

```typescript
// app/src/lib/assistant/plan-iteration-commands.ts
z.discriminatedUnion("type", [
  z.object({ type: z.literal("save_feedback_draft"), text: z.string().max(2000) }),
  z.object({ type: z.literal("clear_feedback_draft") }),
  z.object({ type: z.literal("cancel_proposal"), proposalId: z.string().uuid() }),
]);
```

Expose via `POST /api/assistant/threads/[threadId]/plan-iteration/commands` with `commandId` + idempotency (mirror `guided-flow/commands` transition dedup). **Feedback that creates proposals stays in chat orchestrator**, not as a client command — aligns with "free text in chat only."

**Draft persistence recommendation:** New table `assistant_thread_feedback_drafts` (`threadId` PK, `text`, `updatedAt`, scope columns) over guided-flow slots — keeps iteration state out of journey CAS. [ASSUMED: table preferred; confirm in plan if migration cost is a concern]

### 5. LLM integration

**New prompt builder** `buildPlanRevisionPrompt` in `app/src/server/ai/plan-revision-prompt.ts`:

```typescript
// Source pattern: buildPlanPrompt in prompt-builder.ts [VERIFIED]
// Input: planVersionSnapshot + user feedback + locale
// Output: JSON only matching plan_revision payload:
{
  "summary": "neutral technical PT-BR summary",
  "proposedSnapshot": { "type": "plan", "strategy": "...", "angles": [], "hooks": [], "ctas": [], "constraints": "..." },
  "changes": [{ "field": "ctas", "description": "..." }],
  "writes": ["Cria v3 em status pronto", "Não altera versão aprovada atual"]
}
```

**Implementation notes:**
- Use `getOpenAI()` + `response_format: json_object` same as `executeCreateCreativePlan` [VERIFIED: handler pattern]
- Parse with `artifactProposalPayloadSchema`; reject on denylist keys via `assertSafeArtifactJson`
- Compute `changes` server-side as fallback if model omits entries (field-level string diff of normalized arrays/text) — keeps PLAN-02 satisfied even on partial model output
- Run synchronously inside orchestrator turn (CONTEXT: no async proposal card)
- Clarification: orchestrator calls lightweight `classifyPlanRevisionFeedback` heuristic before LLM — if vague, return 1–2 questions without creating proposal; cap at 2 clarification rounds then propose with best effort [Claude's discretion]

**Orchestrator wiring:**

1. After guided-flow command handling, before generic model stream, check `shouldHandlePlanRevision(thread, userMessage)`
2. If true: call `planIterationService.handleFeedbackTurn(...)` which returns either `{ kind: "clarify", content }`, `{ kind: "redirect", content }`, or `{ kind: "proposal", content, actionRecordId }`
3. On proposal: emit `text_delta` + `action_card` in same turn (mirror tool path lines 263–268 in `orchestrator.ts`)
4. Inject `buildPlanRevisionPromptAugment` into system prompt when campaign linked and plan lineage exists

### 6. Confirmation handler

```typescript
// app/src/server/assistant/action-execution/handlers/revise-creative-plan.ts
export async function executeReviseCreativePlan(ctx: ActionExecutionContext) {
  // sync mode — no Inngest job
  // idempotencyKey: `assistant-action:${ctx.actionId}:plan_revision`
  // 1. re-parse inputSnapshot
  // 2. load proposal; verify pending + sourceVersionId
  // 3. verify head.revision === lineageHeadRevision (else throw stale)
  // 4. transaction: createArtifactVersion, confirm proposal, stale siblings, update working head
  // 5. return { mode: "sync", resultSummary: "Plano v{N} criado" }
}
```

Register in `HANDLERS` map in `execute.ts`. Do **not** call `transitionGuidedFlowAfterAction` unless a guided flow is active — iteration is orthogonal to journey step.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | (project lockfile) | Proposal/action schemas | Already used in artifact-version + action contracts |
| drizzle-orm | (project lockfile) | Transactions, CAS head updates | Phase 203 repository pattern |
| vitest | (project lockfile) | Unit/integration tests | Existing assistant test suite |
| openai SDK | (project lockfile) | Plan revision LLM | Same as `executeCreateCreativePlan` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-intl | (project lockfile) | PT-BR card copy | User locale for summary/writes strings |
| existing `propose_action` tool | — | Action card creation | After proposal record inserted |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `plan-iteration` commands route | Extend `guidedCommandSchema` | Mixes post-journey iteration with journey CAS; harder to reason about stale boundaries |
| New async Inngest job for confirm | Sync handler | CONTEXT requires same-turn proposal; confirm is DB-only, no long IO |
| Client-side proposal generation | Server LLM | Violates SAFE-03 and allowlist guarantees |

**Installation:** None — no new packages.

## Integration Points

| Integration | Touch points | Notes |
|-------------|--------------|-------|
| Orchestrator | `runAssistantTurn` | Add plan-revision branch before generic LLM stream |
| Context builder | `buildAssistantContext` | Optionally include compact plan version summary (working/approved labels) when lineage exists |
| Action contracts | `contracts/index.ts`, `validate.ts`, `registry.ts` | Register `revise_creative_plan`; extend `revalidateOnConfirm` |
| Action execution | `execute.ts`, new handler | Sync path only |
| Artifact repository | `artifact-version.ts` | No schema changes expected — Phase 203 tables suffice |
| Thread API | `threads/[threadId]/route.ts` | Already projects `artifactVersionState`; ensure `pending` proposals surface after propose |
| New plan-iteration API | commands + optional draft GET/PUT | Draft save/clear; proposal cancel |
| UI | `AssistantActionCard.tsx`, `use-assistant-chat.ts` | Render plan revision display; refresh thread on stale confirm error |
| i18n | `messages/pt-BR.json`, `en.json` | Card labels, stale warning, confirm button text |
| Telemetry | `guided-flow-telemetry-lifecycle.ts` or new iteration events | Log propose/confirm/cancel/stale (QA-01 deferred to Phase 207 but hook now) |

**Lazy adoption:** If user feedback arrives before lineage exists, call `adoptArtifactForThread({ artifactType: "plan", artifactId: campaignPlanId })` inside proposal service. [VERIFIED: `adoptArtifactForThread` in service.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version storage | Patch/diff chain on `creative_plans` | `createArtifactVersion` immutable rows | Phase 203 design; prevents silent overwrite |
| Proposal persistence | Guided-flow slots | `assistant_artifact_proposals` | Reload-safe, multiple pending, stale transitions |
| Confirm binding | Ad-hoc timestamp checks | Proposal digest + head revision CAS | Matches v13.8 guided binding precedent |
| JSON safety | Trust LLM output | `artifactProposalPayloadSchema` + `assertSafeArtifactJson` | SAFE-03 compliance |
| Semantic change list | Client diff | Server `changes[]` in payload | PLAN-02; Phase 206 adds richer compare |
| Credit idempotency | Manual balance checks | `idempotencyKey` pattern ready for future pricing | CONTEXT requires idempotent confirm |

## Common Pitfalls

### Pitfall 1: Overwriting approved current on confirm
**What goes wrong:** Confirmation promotes new version or updates `creative_plans`.
**Why:** Reusing `create_creative_plan` handler or setting `approvedCurrentVersionId` on confirm.
**How to avoid:** Handler only sets `workingVersionId`; status `ready`; leave `approvedCurrentVersionId` and `creative_plans` untouched.
**Warning signs:** Tests show `approvedCurrent` changing after revise confirm.

### Pitfall 2: Guided-flow binding on iteration actions
**What goes wrong:** `assertGuidedActionReady` blocks proposal when journey is not at `confirm_plan`.
**Why:** Blind reuse of `propose-action.ts` guided path without branching.
**How to avoid:** Skip `assertGuidedActionReady` for `revise_creative_plan`; use artifact digest binding.
**Warning signs:** Proposal fails after guided journey completes.

### Pitfall 3: Stale confirm succeeds
**What goes wrong:** User confirms after another tab confirmed a sibling proposal or head moved.
**Why:** Missing head revision check in `revalidateOnConfirm`.
**How to avoid:** Bind `lineageHeadRevision` in inputSnapshot; verify in transaction; return 400 `stale_plan_revision`.
**Warning signs:** Two child versions from one source without intentional branching policy.

### Pitfall 4: Auto-replacing pending proposals
**What goes wrong:** New feedback cancels or overwrites prior pending proposal.
**Why:** Misread "stale siblings" as applying on create.
**How to avoid:** `staleSiblingProposals` only on confirm; cancel only via explicit user action.
**Warning signs:** Only one `pending` row per source after multiple feedback messages.

### Pitfall 5: Same-turn async proposal
**What goes wrong:** Proposal card appears in a later turn or polling loop.
**Why:** Inngest/async LLM path.
**How to avoid:** Await LLM inside orchestrator turn before yielding `action_card`.
**Warning signs:** E2E timeout waiting for card in same SSE session.

### Pitfall 6: Out-of-scope field mutation via LLM
**What goes wrong:** Proposal changes briefing/campaign fields.
**Why:** Prompt not constrained to `planVersionSnapshotSchema` fields.
**How to avoid:** Strict schema parse; redirect messaging for briefing changes.
**Warning signs:** `proposedSnapshot` contains unknown keys or briefing terms in summary only.

## Code Examples

### Create proposal record

```typescript
// Pattern from artifact-version repository [VERIFIED: artifact-version.ts:364-394]
const proposal = await createArtifactProposal({
  scope,
  lineageId,
  sourceVersionId: source.id,
  proposalType: "plan_revision",
  payload: parsedPayload, // artifactProposalPayloadSchema
  feedback: userFeedback.slice(0, 2000),
});
```

### Confirm transaction skeleton

```typescript
// Planner implements in revise-creative-plan handler
await db.transaction(async () => {
  const head = await getArtifactHead(scope, lineageId);
  if (!head || head.revision !== expectedRevision) throw stale();

  const version = await createArtifactVersion({
    scope,
    lineageId,
    sourceVersionId,
    status: "ready",
    snapshot: proposal.payload.proposedSnapshot,
    provenance: {
      origin: "revision",
      originalArtifactId: lineage.originalArtifactId,
      sourceVersionId,
      messageId: userMessageId,
      actionId: ctx.actionId,
      planVersionId: null,
      format: null,
      generationMode: null,
    },
    feedback: proposal.feedback,
  });

  await transitionArtifactProposal({ scope, proposalId, nextStatus: "confirmed" });
  await staleSiblingProposals({ scope, lineageId, sourceVersionId, exceptProposalId: proposalId });
  await updateArtifactHead({
    scope,
    lineageId,
    expectedRevision: head.revision,
    workingVersionId: version.id,
    // approvedCurrentVersionId: NOT passed
  });
});
```

### Propose action card (after proposal persisted)

```typescript
// Mirror propose-action.ts [VERIFIED]
await createAssistantAction(ctx.workspaceId, {
  threadId: ctx.threadId,
  content: display.label,
  inputSnapshot: {
    proposalId: proposal.id,
    lineageId,
    sourceVersionId,
    sourceVersionNumber: source.versionNumber,
    lineageHeadRevision: head.revision,
    proposalDigest: artifactProposalDigest({ ... }),
  },
  display: { ...contractDisplay, planRevision: { ... } },
  sourceFlowRevision: null,
  sourceSnapshotDigest: digest,
});
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (project `config/vitest.config.ts`) |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- --run src/server/assistant/plan-iteration/*.test.ts src/server/assistant/action-contracts/contracts/revise-creative-plan.test.ts` |
| Full suite command | `cd app && npm test -- --run src/server/assistant/plan-iteration/*.test.ts src/server/repositories/artifact-version.test.ts src/server/assistant/action-execution/handlers/revise-creative-plan.test.ts src/app/api/assistant/threads/[threadId]/plan-iteration/*.test.ts && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-01 | Feedback creates proposal; approved current unchanged | unit + service | `npm test -- --run src/server/assistant/plan-iteration/service.test.ts -t "creates proposal"` | ❌ Wave 0 |
| PLAN-01 | Approved pointer untouched after proposal | repository integration | `npm test -- --run src/server/assistant/plan-iteration/service.test.ts -t "approved unchanged"` | ❌ Wave 0 |
| PLAN-02 | Action card display includes summary/changes/writes | unit | `npm test -- --run src/lib/assistant/contract-display.test.ts -t "planRevision"` | ❌ Wave 0 |
| PLAN-03 | Confirm creates child version with source link | handler unit | `npm test -- --run src/server/assistant/action-execution/handlers/revise-creative-plan.test.ts` | ❌ Wave 0 |
| PLAN-03 | Idempotent confirm via actionId | handler unit | same file `-t "idempotent"` | ❌ Wave 0 |
| PLAN-04 | Snapshot + provenance + feedback persisted | handler unit | same file `-t "provenance"` | ❌ Wave 0 |
| PLAN-04 | Denylist keys rejected in proposed snapshot | contract | `npm test -- --run src/lib/assistant/artifact-version.test.ts` | ✅ exists |
| VERS-04 (regression) | Reload returns pending proposals + working | route | `npm test -- --run src/app/api/assistant/threads/[threadId]/route.test.ts` | ✅ exists |
| SAFE-01 (regression) | Cross-thread proposal confirm rejected | service | `npm test -- --run src/server/assistant/plan-iteration/service.test.ts -t "scope"` | ❌ Wave 0 |
| Stale confirm | Head revision mismatch rejects | confirm validation | `npm test -- --run src/server/assistant/action-contracts/confirm-validation.test.ts -t "stale_plan_revision"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** quick run command above
- **Per wave merge:** full suite command above
- **Phase gate:** full suite + `npm run build` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `app/src/server/assistant/plan-iteration/service.ts` + tests
- [ ] `app/src/server/assistant/plan-iteration/binding.ts` + tests
- [ ] `app/src/server/assistant/action-contracts/contracts/revise-creative-plan.ts` + tests
- [ ] `app/src/server/assistant/action-execution/handlers/revise-creative-plan.ts` + tests
- [ ] `app/src/server/ai/plan-revision-prompt.ts` + tests (mock OpenAI)
- [ ] `app/src/lib/assistant/plan-iteration-commands.ts`
- [ ] `app/src/app/api/assistant/threads/[threadId]/plan-iteration/commands/route.ts` + tests
- [ ] Migration for `assistant_thread_feedback_drafts` (if table approach chosen)
- [ ] `AssistantActionCard` plan-revision display + component test
- [ ] Extend `revalidateOnConfirm` for artifact binding
- [ ] Orchestrator plan-revision branch + `orchestrator.plan-iteration.test.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | `assertArtifactScope` on all proposal/version mutations |
| V5 Input Validation | yes | Zod schemas + `assertSafeArtifactJson` on LLM output |
| V6 Cryptography | no new crypto | SHA-256 digest for confirm binding only (integrity, not secrecy) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-thread proposal confirm | Elevation of privilege | Scope predicates on proposal/version/head reads |
| Prompt injection via feedback | Tampering | Allowlisted snapshot fields only; denylist recursive check |
| Duplicate confirm double version | Tampering | Transaction + proposal status transition + action idempotency key |
| Stale card confirm after head move | Tampering | Head revision CAS + digest revalidation |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Proposal/version persistence | ✓ (project standard) | — | — |
| OpenAI API | Proposal LLM generation | ✓ [VERIFIED: `getOpenAI` in create-creative-plan] | env-configured | Block proposal with safe error |
| Node.js | App runtime | ✓ | 20+ | — |
| Vitest | Automated validation | ✓ | package.json | — |

**Missing dependencies with no fallback:**
- None identified for core Phase 204 scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Separate `plan-iteration` commands route preferred over extending `guidedCommandSchema` | Commands | Planner may choose guided-flow extension instead — either works if CAS boundaries are clear |
| A2 | `assistant_thread_feedback_drafts` table preferred over guided-flow slots | Commands | Slot approach avoids migration but couples drafts to journey revision conflicts |
| A3 | Reuse `sourceSnapshotDigest` column for artifact proposal digest | Artifact binding | Column semantics stretch slightly; alternative is new column |
| A4 | Max 2 clarification turns before proposing | LLM integration | UX may feel rushed or chatty — tune in implementation |

## Open Questions

1. **Which campaign plan ID to adopt when multiple plans exist?**
   - What we know: Thread links to one `campaignId`; campaigns may have plans.
   - What's unclear: Whether threads always have exactly one active plan artifact.
   - Recommendation: Default to campaign's primary/latest approved plan; if ambiguous, ask user (CONTEXT locked).

2. **Orchestrator vs. tool-based proposal path**
   - What we know: `propose_action` tool works for model-initiated cards; plan revision may be server-initiated after dedicated LLM call.
   - Recommendation: Server calls `createAssistantAction` directly from plan-iteration service (skip tool round-trip) while keeping same card shape.

## Planning Recommendation

Split into **two sequential plans**:

1. **Proposal path:** plan-iteration service, LLM prompt, orchestrator routing, clarification, draft API, `revise_creative_plan` contract + card UI, proposal persistence tests.
2. **Confirmation path:** `revalidateOnConfirm` extension, `executeReviseCreativePlan` handler, head CAS + stale behavior, thread reload integration tests.

This mirrors Phase 203's persistence-first split and keeps confirm invariants reviewable before wiring chat UX.

## Sources

### Primary (HIGH confidence)
- `app/src/lib/assistant/artifact-version.ts` — proposal/version schemas [VERIFIED: codebase]
- `app/src/server/repositories/artifact-version.ts` — CRUD, CAS, proposal transitions [VERIFIED: codebase]
- `app/src/server/assistant/orchestrator.ts` — chat turn + action_card SSE [VERIFIED: codebase]
- `app/src/server/assistant/tools/stubs/propose-action.ts` — action card creation [VERIFIED: codebase]
- `app/src/server/assistant/action-contracts/validate.ts` — propose/confirm validation [VERIFIED: codebase]
- `.planning/phases/203-artifact-version-foundation/203-RESEARCH.md` — upstream foundation
- `.planning/phases/204-plan-iteration-loop/204-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — `revise_creative_plan` action name, append-only pattern
- `.planning/research/SUMMARY.md` — no new dependencies decision

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — reuses existing project libraries only
- Architecture: HIGH — Phase 203 primitives verified in codebase; action pipeline precedent clear
- Pitfalls: HIGH — derived from CONTEXT constraints + existing guided/artifact binding patterns

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable domain; LLM prompt copy may iterate sooner)

## RESEARCH COMPLETE

**Phase:** 204 - Plan Iteration Loop
**Confidence:** HIGH

### Key Findings
- Phase 203 already provides proposal storage, version creation, head CAS, and thread reload projection — Phase 204 is orchestration + LLM + action-card UX, not new schema (except optional feedback drafts).
- Use `revise_creative_plan` action contract with artifact proposal digest binding; do not reuse guided-flow `assertGuidedActionReady`.
- Confirmation is a sync DB transaction: child `ready` version, proposal `confirmed`, siblings `stale`, `workingVersionId` updated only.
- Proposal generation must complete synchronously in the chat turn; approved current and `creative_plans` stay untouched until Phase 206.
- Extend `AssistantActionCard` and `revalidateOnConfirm`; no new npm packages required.

### File Created
`.planning/phases/204-plan-iteration-loop/204-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Verified existing dependencies and patterns |
| Architecture | HIGH | Code-level verification of Phase 203 + action pipeline |
| Pitfalls | HIGH | Grounded in locked CONTEXT + repository invariants |

### Open Questions
- Primary plan artifact resolution when campaign has multiple plans (default + ask user).
- Server-direct `createAssistantAction` vs. tool indirection for proposal cards (recommend direct).

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
