# Phase 203: Artifact Version Foundation - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish one immutable, scoped, resumable version model for creative plans and generated creatives. This phase delivers lineage identity, safe snapshots, provenance, approved-current and working-selection pointers, legacy adoption, and reload state. It does not implement conversational plan revision (Phase 204), creative generation revision (Phase 205), comparison/approval UI (Phase 206), or integrated UAT (Phase 207).

</domain>

<decisions>
## Implementation Decisions

### Legacy adoption
- Existing plans and creatives become version `v1` lazily when first accessed through the iterative chat; do not bulk-migrate the full historical corpus and do not limit versioning to newly created artifacts.
- The imported `v1` records explicit legacy provenance and points to the original artifact. It must not invent triggering feedback or a synthetic explanation.
- The first assistant thread that adopts an existing artifact owns its editable lineage. Other threads may consult it but cannot mutate that lineage.
- Legacy approval is mirrored: an already approved artifact becomes the approved current version; an unapproved artifact enters history without an approved current version.

### Approved current and working selection
- A lineage may exist with no approved current version until the user explicitly approves one.
- Keep two distinct concepts: the approved current version is the official choice; the working selection is the version currently opened for review or revision in the thread.
- Selecting a version changes the working selection but never changes the approved current pointer by itself.
- When a new version is approved, the previous one remains labeled as previously approved. It is neither rejected nor deleted.
- Promotion and current-pointer changes must preserve the single-approved-current invariant under concurrent requests.

### Lineage boundaries
- Alternative creatives generated in the same batch are separate lineages. A revision lineage begins from the specific creative the user chooses.
- Creative formats evolve in separate lineages. A 1:1, 4:5, or 9:16 adaptation keeps provenance to its source creative but is not treated as another version in the source format's lineage.
- A plan lineage belongs to one assistant thread, within its fixed workspace, client, and campaign scope.
- Revising an older version requires promoting it first. The next revision then extends the linear current lineage; Phase 203 must not enable arbitrary branches or merges.

### Resume and recovery
- Reload restores both the thread's working selection and the lineage's approved current version.
- Pending proposals reopen for review exactly as proposals; reload never confirms, writes, spends credits, or starts generation automatically.
- In-progress generation resumes from its real persisted status while its source version remains approved current until a generated result is later approved.
- On a stale-state conflict, refresh canonical server state, block the stale action, and preserve the user's unsubmitted feedback so it can be reapplied.
- Unsubmitted feedback drafts survive reload locally and are scoped to the current thread. They are not persisted as confirmed feedback.
- Failed generation restores the source as working selection and exposes safe idempotent retry; it does not restart automatically.
- Working selection, proposal state, and feedback draft are independent per thread.

### Pending proposal queues
- Support multiple pending proposals, separated by artifact rather than one mixed thread queue.
- Present the newest proposal first while preserving older proposals for inspection.
- Each proposal remains bound to its exact source version.
- After one proposal is confirmed, other pending proposals based on that same source become stale and require refresh before confirmation; they are not silently discarded.
- Similar feedback entries remain separate proposals. Do not merge them automatically.

### Safe persisted history
- Persist immutable full snapshots rather than reconstructing versions from patch chains.
- Persist typed, allowlisted provenance needed by the product: source version, lifecycle status, creation time, triggering feedback when present, original artifact reference, and safe generation/plan provenance.
- Exclude reasoning, thinking, signed URLs, raw provider payloads, raw tool arguments, internal evidence, and unallowlisted prompt data at the repository boundary.
- Enforce workspace, client profile, campaign, and assistant thread scope on every version, proposal, pointer, and resume-state read or mutation.

### Claude's Discretion
- Exact table split, index names, transaction shape, and repository API boundaries.
- Exact lifecycle enum names, provided the user-facing meanings above remain distinct.
- Exact snapshot schemas and allowlist validators for plan versus creative versions.
- Whether legacy adoption occurs in a dedicated service or repository transaction, provided it is idempotent and concurrency-safe.
- Pagination mechanics for long histories and pending proposal queues.

</decisions>

<specifics>
## Specific Ideas

- "Versao em trabalho" and "versao aprovada atual" are intentionally separate states.
- Historical approval remains meaningful after promotion: show it as previously approved, not rejected.
- Multiple proposals are useful, but confirmation of one must make conflicting proposals visibly stale instead of merging or deleting them.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assistant_guided_flows` and `guided-flow.ts`: existing thread/client/workspace scope validation, typed persisted state, revision-based compare-and-swap, and safe JSON checks.
- `assistant_action_records` and `assistant-action.ts`: immutable reviewed snapshots, source flow revision/digest binding, action lifecycle, and transaction patterns.
- `creative_plans` and `plan.ts`: current mutable plan record to wrap with immutable version snapshots without silently changing historical versions.
- `derivations` and `derivation.ts`: existing creative records already carry `parentId`, `planId`, generation status, output reference, and provenance useful for legacy adoption and creative-version linkage.

### Established Patterns
- Drizzle schema plus registered SQL migrations and repository-level scoped queries.
- `assistant_guided_flows.revision` compare-and-swap returns current state on conflicts.
- Persistence denylist checks reject sensitive JSON keys before writes.
- Assistant action cards bind confirmations to reviewed snapshots and source revisions.

### Integration Points
- Guided-flow presentation state must expose working selections, approved-current pointers, pending proposal summaries, generation status, and recoverable conflicts on reload.
- Plan and derivation repositories remain the canonical original-artifact sources used by lazy `v1` adoption.
- Later Phase 204/205 services will create proposals and child versions through the version repository established here.
- Phase 206 approval/promotion must update the approved-current pointer atomically without mutating immutable snapshots.

</code_context>

<deferred>
## Deferred Ideas

- Proposal authoring and semantic plan diffs - Phase 204.
- Creative revision generation, credit charging, callback idempotency, and retry execution - Phase 205.
- Version comparison and approval/promotion interaction surfaces - Phase 206.
- Cross-thread editable collaboration, arbitrary branching, and merge resolution - future milestone.

</deferred>

---

*Phase: 203-artifact-version-foundation*
*Context gathered: 2026-06-27*
