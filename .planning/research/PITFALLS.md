# Pitfalls Research

**Domain:** Iterative creative versioning in chat
**Researched:** 2026-06-27
**Confidence:** HIGH

## Critical Pitfalls

### 1. Mutable history
**Failure:** editing current plan/derivation destroys source comparison.
**Prevention:** immutable version rows; approval only changes pointer/status.
**Verify:** source snapshot unchanged after revise/approve/revert.

### 2. Stale approval
**Failure:** action approves version built from superseded feedback/source.
**Prevention:** bind action to source version, guided revision, snapshot digest; confirm-time revalidation.
**Verify:** old card returns conflict after any relevant revision.

### 3. “Diff” that users cannot understand
**Failure:** raw JSON or prompt text shown as comparison.
**Prevention:** typed semantic changes: strategy, angle, hook, CTA, constraints, visual direction, format.
**Verify:** no denied/internal fields reach presenter.

### 4. Duplicate credit/job effects
**Failure:** retry creates multiple revisions or spends twice.
**Prevention:** action/version idempotency key; unique source-action constraint; job sync upsert.
**Verify:** repeated confirmation/job callback yields one version.

### 5. Current pointer race
**Failure:** two versions become current.
**Prevention:** transaction + unique invariant + expected current version.
**Verify:** concurrent promotion test leaves one current row.

### 6. Plan and creative drift
**Failure:** creative revision references plan no longer current without disclosure.
**Prevention:** creative snapshot stores exact plan version; UI labels source plan.
**Verify:** lineage visible after later plan approval.

## Security/Privacy

- Never persist raw model reasoning, signed URLs, provider payloads, or unfiltered prompts in version snapshots.
- Enforce workspace + client profile + campaign + thread scope on every read/write.
- User feedback may contain sensitive text; store only necessary feedback summary and original user message reference.

## UX Traps

| Trap | Better approach |
|---|---|
| Version timeline becomes chat noise | Compact artifact strip; expand on demand |
| Approval hidden after generation | Persistent outcome card with compare/approve commands |
| Comparing more than two versions | Two-version compare in v13.9 |
| “Revert” mutates history | Promote old immutable version as current |
| Loading shifts layout | Stable compare dimensions and explicit generation status |

## Looks Done But Is Not

- [ ] Plan revisions survive reload.
- [ ] Creative async failure leaves source current and retryable.
- [ ] Approval never spends credits.
- [ ] Rejected version remains inspectable.
- [ ] Revert creates audit event without deleting descendants.
- [ ] Action card becomes stale after source/current change.
- [ ] Both artifact types enforce client/workspace isolation.

## Phase Mapping

| Pitfall | Prevention phase |
|---|---|
| Mutable history/current race | Version domain foundation |
| Stale approval/duplicate effects | Action integration |
| Plan-creative drift | Creative iteration |
| Unreadable diff/chat noise | Compare UX |
| Scope/reload/recovery gaps | Integrated UAT |

---
*Pitfall research for v13.9.*
