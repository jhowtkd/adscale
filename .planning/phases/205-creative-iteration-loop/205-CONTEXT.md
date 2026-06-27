# Phase 205: Creative Iteration Loop - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn chat feedback on a selected creative into an inspectable `creative_revision` proposal, let the user review intended visual changes, format, references, credit impact, and write effects, then confirm to enqueue one async generation job that produces a single child creative version linked to the exact source creative and frozen plan version — without overwriting the approved current creative, with idempotent confirmation/charge/job/retry, and safe recovery on failure or cancel. This phase delivers proposal authoring, credit-gated confirmation, async generation wiring, reload-safe lifecycle, and retry. It does not implement compare/approve/promote UI (Phase 206) or full UAT (Phase 207).

</domain>

<decisions>
## Implementation Decisions

### Creative revision target
- Default revision target is the thread's **working** creative version (mirrors plan "versão em trabalho").
- If no working creative is set but lineage/history exists, **ask the user** which creative/version to revise before proposing (differs from plan fallback-to-approved).
- If multiple creative lineages exist (e.g., 1:1 and 9:16), **ask which creative/format** to revise.
- When working creative differs from approved current, show an explicit warning on the proposal card (same pattern as Phase 204 plan revision).
- Block creative revision proposals until a plan lineage is adopted in the thread; explain that a plan must exist first.

### Plan version binding
- Freeze `planVersionId` at **proposal creation**; generation uses that exact plan snapshot.
- If the working plan changes after the proposal was created, mark the creative proposal **stale**; user must refresh/recreate before confirm (server rejects stale confirm).
- Show the bound plan version label on the action card (e.g., "Plano: v2").

### Feedback entry and routing
- Classify user intent **first** (plan revision vs creative revision vs generic/ambiguous) before calling handlers.
- Orchestrator order: classify → route to plan handler OR creative handler OR clarify → only then generic LLM.
- Ambiguous feedback ("melhora isso") triggers **one** clarifying question: plano or criativo?
- Use lightweight heuristics: visual keywords (cor, layout, imagem, fundo, foto, visual) → creative; plan-field keywords → plan (same family as Phase 204 intent).
- Mirror Phase 204 elsewhere unless overridden: free-text chat only, one message = one proposal, clarify vague feedback before proposing, server-persisted unsent drafts per thread, explicit proposal cancel, neutral/technical summary tone, PT-BR card copy when user locale is pt.

### Proposal review
- Review surface is an action card in chat (v13.8 pattern), showing summary, intended visual changes, format, **listed references** (count + names/thumbnails when available), bound plan version label, write effects, and credit impact summary.
- Confirmation uses an explicit button (e.g., "Confirmar revisão do criativo"), not chat text alone.
- **Secondary confirmation modal** shows credit cost before final confirm (user chose modal over inline-only credit display).
- Stale proposals show warning but keep confirm visible; server must reject stale confirmation.
- Reject-and-retry via new feedback; no inline editing on the proposal card.

### References and format
- Chat image attachments in the feedback turn are included in the proposal as visual references.
- Merge guided-journey references (from_zero) **and** chat attachments into the proposal reference list.
- Request for a different output format (e.g., "faz em 9:16") is **not** a creative_revision — redirect to format adaptation / new lineage per Phase 203 rules.

### Async generation UX
- Reuse action-card lifecycle: `pending` → `confirmed`/`running` → `completed`/`failed`/`canceled` (same family as `quick_restyle`).
- On success, show preview in the thread when ready (message and/or updated card).
- User may continue chatting while generation runs in background.
- Reload restores card with real persisted job status (`running`/`completed`/`failed`).
- User may **cancel** an in-flight generation from the card; source creative remains current.
- At most **one active generation per creative lineage**; block new confirmation on that lineage while running.
- On failure, card moves to `failed` with safe error message and **retry** affordance.
- On success, new version is `ready`; working selection switches to it; approved current unchanged (promotion is Phase 206).

### Credits and billing
- Show estimated credit impact before final confirm via **secondary modal** (in addition to card summary).
- **Charge credits on confirm**, before enqueueing the job, using idempotent key scoped to the action record.
- Block confirmation with clear message if insufficient credits; proposal stays `pending`.
- **Auto-refund credits** if the generation job fails after charge.
- Retry after refund **charges again** on retry confirm (consistent with re-execution).
- Retry on failed action is **idempotent on the same action record** — no duplicate charge for the same retry attempt key.

### Failure, cancel, and idempotency (SAFE-02)
- Failed or canceled generation leaves source version as approved/working baseline per Phase 203 recovery rules.
- Retry reexecutes the **same action record** without creating duplicate charges/versions for the same attempt.
- Job/callback processing uses **idempotency key per actionId** to prevent duplicate child versions on double callback.
- User-initiated **cancel** does not offer retry on the same card; user must start a new proposal if they want another attempt.
- Duplicate confirmation, callback, or retry must not create duplicate charges, jobs, or versions.

### Post-confirmation lifecycle
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

</decisions>

<specifics>
## Specific Ideas

- Creative iteration mirrors Phase 204's inspect → confirm → child version pattern, but generation is async and credit-gated.
- "Versão em trabalho" for creatives; ask when ambiguous rather than silently picking approved.
- Credit modal is an extra beat before spend — user wants explicit cost acknowledgment.
- Failed jobs should refund; retry is a fresh charge on the same action idempotency boundary.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `artifactProposalPayloadSchema` type `creative_revision`: `intendedChanges`, `format`, `referenceIds`, `creditImpact`, `writes`.
- `creativeVersionSnapshotSchema` with `derivationId`, `planVersionId`, format fields.
- Phase 204 plan-iteration module: proposal/confirm/cancel patterns, action cards, draft hook, orchestrator pre-LLM branch.
- `quick_restyle` handler: credit spend, Inngest enqueue, derivation creation, async action lifecycle.
- `AssistantActionCard` + `useCancelAssistantAction` / confirm mutations with proposal cascade (204-03).
- `getThreadArtifactVersionState` exposes `pendingProposals`, `generationStatus` for reload.

### Established Patterns
- Immutable child versions with provenance; proposals pending until explicit confirm.
- Action records bind `inputSnapshot` with `proposalId`, digest, lineage head revision.
- Idempotent credit spend: `assistant-action:{actionId}:{action}` keys.
- Campaign-thread orchestrator branches before generic LLM.

### Integration Points
- New `creative-iteration` service parallel to `plan-iteration/service.ts`.
- Orchestrator: intent classifier routes to plan vs creative handlers.
- Confirm handler enqueues generation job and updates artifact version state on callback.
- Thread reload must restore pending creative proposals, generation status, drafts, working/approved pointers.

</code_context>

<deferred>
## Deferred Ideas

- Auto-approve creative on generation success — Phase 206.
- Format change inside creative_revision — redirect to new lineage / adaptation flow.
- Inline credit display without modal — user chose secondary modal.
- Retry after user cancel on same card — rejected; new proposal required.
- Field-by-field visual diff UI — Phase 206 compare.
- Plan revision routing changes — owned by Phase 204.

</deferred>

---

*Phase: 205-creative-iteration-loop*
*Context gathered: 2026-06-27*
