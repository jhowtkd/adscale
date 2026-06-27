# Phase 204: Plan Iteration Loop - Research

**Researched:** 2026-06-27
**Scope:** PLAN-01, PLAN-02, PLAN-03, PLAN-04

## Executive Summary

Phase 203 delivered immutable version storage, proposal queues, head pointers, lazy adoption, and thread presentation. Phase 204 must close the conversational loop: detect plan-revision intent, optionally clarify vague feedback, generate a `plan_revision` proposal synchronously via LLM, surface it through the existing action-card pattern, and on confirmation create a `ready` child version while leaving approved current and mutable `creative_plans` untouched.

No new dependency is required. Reuse OpenAI text model (`env.OPENAI_TEXT_MODEL`), `artifactProposalPayloadSchema`, `createArtifactProposal`, `createArtifactVersion`, `updateArtifactHead`, `staleSiblingProposals`, `transitionArtifactProposal`, action contracts, `handleProposeAction`, and `AssistantActionCard`.

The main gap is orchestration: post-plan chat currently routes through generic LLM turns and guided-flow commands. Plan iteration needs a dedicated branch that resolves the plan lineage, picks the revision source (working → approved fallback), runs proposal generation, and binds confirmation to proposal digest + source version + head revision.

## Existing Foundation

### Phase 203 primitives (ready)

- `planVersionSnapshotSchema` with strategy, angles, hooks, ctas, constraints.
- `artifactProposalPayloadSchema` type `plan_revision`: summary, proposedSnapshot, changes[], writes[].
- Repository: `createArtifactProposal`, `listArtifactProposals`, `transitionArtifactProposal`, `staleSiblingProposals`.
- Repository: `createArtifactVersion`, `updateArtifactHead` with revision CAS.
- Service: `adoptArtifactForThread`, `getThreadArtifactVersionState` exposes `pendingProposals`.
- Thread route already merges artifact version state into presentation.

### Action and confirmation patterns (ready)

- `create_creative_plan` contract shows credit-bearing sync execution pattern; Phase 204 should use `creditImpact: { kind: "none" }` or equivalent zero-cost contract field.
- `handleProposeAction` → `createAssistantAction` → `action_card` event in orchestrator.
- `revalidateOnConfirm` checks contract, credits, guided-flow binding.
- `executeConfirmedAssistantAction` dispatches by `actionType` handler map.
- `AssistantActionCard` + `parseActionCardDisplay` already render pending actions.

### Gaps (Phase 204 must build)

1. **Proposal authoring service** — LLM prompt from source snapshot + feedback → proposed snapshot + semantic `changes[]` + neutral summary + `writes[]`.
2. **Revision source resolution** — working version default, approved fallback, explicit ask when no plan lineage exists.
3. **Clarification path** — detect vague feedback, return assistant question instead of proposal (1–2 turns).
4. **Action contract `revise_creative_plan`** — input binds `proposalId`, `lineageId`, `sourceVersionId`, digest of payload; zero credits.
5. **Confirm handler** — transactional: validate proposal pending + source match, create `ready` version with provenance (`origin: revision`, messageId, actionId), update working head only, stale siblings, mark proposal confirmed; reject stale proposals server-side.
6. **Orchestrator branch** — after campaign-linked thread with plan lineage, classify plan-revision intent before generic LLM; route out-of-scope requests back to guided journey.
7. **Server-persisted feedback drafts** — thread-scoped draft text (extend `assistant_guided_flows` iteration slot or small `assistant_thread_drafts` table).
8. **Cancel proposal API/command** — `transitionArtifactProposal` to `canceled`.
9. **UI card copy** — PT-BR summary, source version label, write effects, stale warning; no field-by-field diff.

## Recommended Architecture

### 1. Plan revision service (`app/src/server/assistant/plan-iteration/`)

```text
proposePlanRevision(input) → { kind: "clarify", question } | { kind: "proposal", proposal, actionCard }
confirmPlanRevision(input) → { version, presentation }
cancelPlanRevision(input) → { proposal }
```

Responsibilities:
- Resolve scope via thread → campaign.
- Ensure plan lineage exists (`adoptArtifactForThread` on first access).
- Pick `sourceVersionId` from working head, else approved current.
- Warn payload metadata when working ≠ approved (for card display).
- Call LLM with strict JSON output validated against `planVersionSnapshotSchema`.
- Build `changes[]` by comparing source vs proposed snapshots field-by-field server-side (do not trust model for diff list).
- `createArtifactProposal` with feedback text.
- Return structured display for action card.

### 2. Semantic diff builder

Pure function: `buildPlanSemanticChanges(before: PlanSnapshot, after: PlanSnapshot) → { field, description }[]`.
Fields: strategy, angles, hooks, ctas, constraints.
Used for payload `changes` and card summary inputs; full before/after UI deferred to Phase 206.

### 3. Action contract `revise_creative_plan`

```typescript
{
  proposalId: uuid,
  lineageId: uuid,
  sourceVersionId: uuid,
  payloadDigest: string, // hash of canonical proposal payload
}
```

- `confirmationPolicy: "required"`
- `creditImpact: { kind: "none" }` (or project equivalent)
- `allowedRoles`: owner, admin, member
- Revalidation: proposal still `pending`, sourceVersionId matches, digest matches, head revision unchanged or revalidated

### 4. Execution handler `executeReviseCreativePlan`

Sync handler (no Inngest):
1. Re-read proposal inside transaction scope.
2. Reject if `stale` or source superseded.
3. `createArtifactVersion` status `ready`, provenance links source/action/message.
4. `updateArtifactHead` working only (not approved).
5. `staleSiblingProposals`.
6. `transitionArtifactProposal` → `confirmed`.
7. Do **not** update `creative_plans` row.

### 5. Orchestrator integration

Add pre-LLM branch when `thread.campaignId` and plan lineage exists (or plan in campaign):
- `classifyPlanRevisionIntent(message)` → `revise | clarify | out_of_scope | continue`
- `revise` with sufficient detail → call `proposePlanRevision`, emit `action_card`.
- `clarify` → assistant question message, persist draft if partial input.
- `out_of_scope` → redirect copy to guided journey.
- `continue` → fall through to existing LLM path.

Keep guided-flow commands separate; do not store iteration state in briefing slots.

### 6. Feedback draft persistence

Store `{ planFeedbackDraft: string | null, updatedAt }` on thread-scoped record.
Options (planner discretion):
- JSON column on `assistant_threads` metadata, or
- `assistant_guided_flows.slots.iterationDraft` when flow completed, or
- dedicated lightweight table.

Must survive reload; must not create proposals until user sends.

### 7. API surface

- `POST /api/assistant/threads/[threadId]/plan-revisions/propose` (optional if orchestrator-only)
- `POST /api/assistant/threads/[threadId]/plan-revisions/draft` — save draft
- `POST /api/assistant/artifact-proposals/[id]/cancel` — cancel pending

Prefer orchestrator-internal service calls; expose routes only where client needs them (draft save, cancel).

## Integration Points

| System | Integration |
|--------|-------------|
| Orchestrator | Intent branch before generic LLM; emit action_card |
| Action confirm route | Existing confirm → execute handler |
| Thread GET | Already returns `pendingProposals`; ensure new proposals appear |
| AssistantActionCard | Extend display parser for `revise_creative_plan` |
| Guided flow | Redirect out-of-scope; no iteration in briefing slots |
| Phase 206 | Consumes `ready` versions and unchanged approved pointer |

## Pitfalls

1. **Silent overwrite** — never mutate source version or `creative_plans` on confirm.
2. **Stale confirm** — UI may show button; server must reject stale proposal transitions.
3. **Wrong source version** — always bind proposal to exact `sourceVersionId`; revalidate on confirm.
4. **LLM schema drift** — parse with Zod; build `changes[]` server-side.
5. **Credit leak** — contract must be zero-cost; no `spendCredits` in handler.
6. **Guided-flow binding** — post-journey actions may lack guided flow; use proposal digest binding instead of `assertGuidedActionReady` for iteration actions.
7. **Concurrent proposals** — each feedback creates separate proposal; confirming one stalemates siblings on same source.

## Validation Architecture

### Test layers

| Layer | Focus | Files |
|-------|-------|-------|
| Unit | Semantic diff builder, payload digest, snapshot merge | `plan-iteration/diff.test.ts`, `plan-iteration/proposal.test.ts` |
| Service | Source resolution, clarify vs propose, confirm transaction | `plan-iteration/service.test.ts` |
| Handler | Confirm creates version, working head only, no plan row mutation | `handlers/revise-creative-plan.test.ts` |
| Route | Draft save, cancel proposal, confirm idempotency | `route.test.ts` files |
| Component | Card renders summary, source version, confirm button, stale warning | `AssistantActionCard.test.tsx` |

### Requirement mapping

| Requirement | Automated proof |
|-------------|-----------------|
| PLAN-01 | Service test: feedback creates proposal; approved current unchanged |
| PLAN-02 | Component + contract test: card shows summary before confirm |
| PLAN-03 | Handler test: confirm creates child version with provenance links |
| PLAN-04 | Service test: snapshot preserves all plan fields + feedback provenance |
| Reload | Service/route test: pending proposal + draft + head state after reload |

### Commands

```bash
# Quick
cd app && npm test -- --run src/server/assistant/plan-iteration/

# Full phase gate
cd app && npm test -- --run src/server/assistant/plan-iteration/ src/server/assistant/action-execution/handlers/revise-creative-plan.test.ts src/components/assistant/AssistantActionCard.test.tsx && npm run build
```

## Sources

- `.planning/phases/204-plan-iteration-loop/204-CONTEXT.md`
- `.planning/phases/203-artifact-version-foundation/203-RESEARCH.md`
- `app/src/lib/assistant/artifact-version.ts`
- `app/src/server/repositories/artifact-version.ts`
- `app/src/server/assistant/artifact-version/service.ts`
- `app/src/server/assistant/orchestrator.ts`
- `app/src/server/assistant/tools/stubs/propose-action.ts`
- `app/src/server/assistant/action-contracts/contracts/create-creative-plan.ts`
- `.planning/research/ARCHITECTURE.md`

## RESEARCH COMPLETE
