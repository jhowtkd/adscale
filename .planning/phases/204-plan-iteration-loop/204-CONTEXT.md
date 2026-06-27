# Phase 204: Plan Iteration Loop - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn chat feedback into an inspectable plan revision proposal, let the user review a semantic summary, and confirm to create one immutable child plan version — without overwriting the approved current plan or mutating the campaign's mutable `creative_plans` row. This phase delivers proposal authoring, clarification turns, action-card review, confirmation, and reload-safe lifecycle. It does not implement full two-version compare UI, approve/promote controls, or creative revision (Phases 206 and 205).

</domain>

<decisions>
## Implementation Decisions

### Feedback entry
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

### Proposal review
- Review surface is an action card in chat, reusing the v13.8 action-card pattern.
- Before confirmation, show summary-only narrative; field-by-field before/after diff is deferred to Phase 206.
- If the user dislikes the proposal, reject and send new feedback; no inline field editing on the proposal card.
- Confirmation uses an explicit button (e.g., "Confirmar revisão do plano"), not chat text alone.
- The card shows the source version label (e.g., "Revisando v2 do plano").
- The card lists write effects at confirm time (e.g., creates v3, does not change approved current).
- Stale proposals show a warning but keep the confirm affordance visible; the server must still reject stale confirmation per Phase 203 rules.
- Summary and card copy are in PT-BR when that is the user's locale.

### Post-confirmation lifecycle
- Confirmation creates a new immutable child plan version in `ready` status; it does not auto-approve.
- Working selection switches to the newly confirmed version.
- Approved current pointer stays unchanged; promotion belongs to Phase 206.
- The mutable `creative_plans` campaign row does not update on confirmation; only immutable version snapshots change until promotion.

### Credits
- Plan revision is free: neither proposal generation nor confirmation spends credits.
- Do not show credit copy on the card when cost is zero.
- If pricing changes later, confirmation must remain idempotent.

### Claude's Discretion
- Exact action contract name, command envelope, and orchestrator/tool wiring.
- LLM prompt for proposal generation and semantic change extraction into `artifactProposalPayloadSchema`.
- Server-side draft persistence shape and API (table vs. guided-flow extension).
- Exact stale-card warning copy and refresh behavior after server rejection.
- Clarification turn limit enforcement and when to stop asking and propose anyway.

</decisions>

<specifics>
## Specific Ideas

- "Versão em trabalho" is the default revision target; warn when it diverges from approved current.
- Proposal review stays lightweight in chat; rich compare belongs in Phase 206.
- Confirm means "create ready version," not "approve as current."

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `artifactProposalPayloadSchema` with `plan_revision` type: `summary`, `proposedSnapshot`, `changes[]`, `writes[]`.
- `createArtifactProposal`, `listArtifactProposals`, and artifact version repository from Phase 203.
- `getThreadArtifactVersionState` and thread route already expose `pendingProposals` in presentation.
- v13.8 action cards and `assistant_action_records` revision/digest binding for confirm flows.
- `planVersionSnapshotSchema`: strategy, angles, hooks, ctas, constraints.

### Established Patterns
- Server-owned typed commands with revision CAS on `assistant_guided_flows`.
- Immutable snapshots with allowlisted provenance; proposals stay pending until explicit confirm.
- Diagnosis/briefing action cards as the review-and-confirm UX precedent.

### Integration Points
- Assistant orchestrator or guided-conversation service receives free-text feedback and routes to plan-revision proposal service.
- Confirmation binds to proposal digest + source version + flow revision before creating child version.
- Thread reload must restore pending proposals, server-persisted drafts, working selection, and approved current unchanged.
- Phase 206 will add promote/approve without changing Phase 204 confirmation semantics.

</code_context>

<deferred>
## Deferred Ideas

- Structured quick actions ("Ajustar CTA", "Novo ângulo") — future UX enhancement.
- Field-by-field before/after diff in review card — Phase 206 compare UI.
- Inline editing of proposed plan fields — rejected; use reject-and-retry feedback loop.
- Briefing/campaign field changes via plan revision — redirect to guided journey.
- Credit charging for plan revisions — explicitly deferred; remain free in v13.9.
- Syncing mutable `creative_plans` on confirm — deferred to Phase 206 promotion.

</deferred>

---

*Phase: 204-plan-iteration-loop*
*Context gathered: 2026-06-27*
