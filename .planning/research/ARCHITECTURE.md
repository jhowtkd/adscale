# Architecture Research

**Domain:** Versioned conversational plan/creative iteration
**Researched:** 2026-06-27
**Confidence:** HIGH

## System Shape

```text
Chat feedback
  -> typed iteration command + expected revision
  -> proposal snapshot + semantic diff
  -> confirmable action card
  -> plan revision or derivation job
  -> immutable artifact version
  -> compare UI
  -> approve/promote current version
```

## New Boundaries

| Component | Responsibility |
|---|---|
| `assistant_artifact_versions` | Immutable plan/creative version identity, parent, snapshot/ref, status |
| `assistant_iteration_requests` | Feedback, source version, proposed changes, action linkage, lifecycle |
| Version repository | Workspace/client/thread/campaign scoping; append/list/promote transaction |
| Iteration command service | Legal propose/compare/approve/revert transitions with CAS |
| Action contracts | `revise_creative_plan`, `revise_creative`, optional credit impact |
| Compare presenter | Typed plan fields and creative metadata; no raw internal payload |
| Iteration panel | Timeline, compare selector, change summary, approval controls |

## Data Model

- `artifactType`: `plan | creative`.
- `artifactRefId`: plan ID or derivation ID; validated by type and workspace.
- `parentVersionId`: source version; one parent only in v13.9.
- `snapshot`: typed plan content or safe creative metadata/provenance.
- `status`: `proposed | generating | ready | approved | rejected | failed`.
- `isCurrent` via unique partial index per artifact lineage, or separate current pointer updated transactionally.
- `sourceActionId`, `sourceMessageId`, `feedbackSummary`, timestamps.

## Key Patterns

1. **Append, never overwrite:** plan revisions create new plan/version rows. Existing approved row stays intact.
2. **Promote transaction:** lock/check source revision, clear prior current, approve target, update campaign pointer atomically.
3. **Action-bound execution:** proposal digest binds feedback + source version + proposed snapshot.
4. **Reference, do not copy media:** creative version points to derivation/output key already owned by storage layer.
5. **Canonical server compare:** API returns allowlisted semantic changes; UI only renders.

## Integration Points

- `assistant_guided_flows`: add iteration/post-action steps or linked iteration state; do not overload initial briefing answers.
- `assistant_action_records`: reuse revision/digest binding and job refs.
- `creative_plans`: likely add supersession/current semantics or treat each row as immutable revision.
- `derivations.parentId`: reuse for creative lineage, while artifact versions unify plan/creative presentation.
- `AssistantReviewPanel`: extend into version timeline/compare surface.
- Inngest sync: action completion creates ready version idempotently.

## Phase Order

1. Version domain + migration/repository.
2. Plan iteration commands/actions.
3. Creative iteration async execution/recovery.
4. Compare/approval UX.
5. Integrated browser UAT and audit.

## Sources

- Repo schema/repositories listed in `STACK.md`.
- PostgreSQL MVCC/isolation docs: https://www.postgresql.org/docs/17/transaction-iso.html
- TanStack query invalidation: https://tanstack.dev/query/latest/docs/framework/react/guides/query-invalidation

---
*Architecture research for v13.9.*
