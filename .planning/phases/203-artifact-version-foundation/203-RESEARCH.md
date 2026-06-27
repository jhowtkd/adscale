# Phase 203: Artifact Version Foundation - Research

**Researched:** 2026-06-27
**Scope:** VERS-01, VERS-02, VERS-03, VERS-04, SAFE-01, SAFE-03

## Executive Summary

The repository already has the right primitives for this phase: Drizzle migrations, scoped assistant repositories, transaction-backed compare-and-swap on guided-flow revisions, safe JSON denylist checks, immutable assistant action snapshots, mutable `creative_plans`, and derivations with parent/provenance fields. No new dependency is needed.

The version model should not overload existing mutable plan or derivation rows. Add a dedicated assistant artifact domain with separate lineage, immutable version snapshot, mutable head pointer, and proposal records. This avoids patch-chain reconstruction, gives one atomic approved-current pointer, preserves a distinct working selection, and supports multiple pending proposals without treating proposals as committed versions.

## Existing Foundation

### Data sources

- `creative_plans` is a mutable campaign-scoped record with strategy, angles, hooks, CTAs, and status.
- `derivations` already records campaign/workspace, optional plan and parent derivation, generation status, output key, format, generation mode, feedback, creative contract, prompt provenance, and quality metadata.
- `assistant_threads` already fixes workspace, client profile, and optional campaign ownership.
- `assistant_guided_flows` already has per-thread resumable state, schema version, revision, recoverable error, and compare-and-swap writes.
- `assistant_action_records` already binds reviewed input snapshots to a source flow revision and digest.

### Patterns to reuse

- Repository scope assertions before every mutation.
- Transactional CAS using `revision = expectedRevision`, returning a typed conflict.
- Explicit JSON validation before writes using `containsDeniedPersistenceKeys`.
- SQL migration plus journal registration.
- Co-located Vitest repository, service, and route tests.

## Recommended Domain Model

### 1. Artifact lineage

Create `assistant_artifact_lineages` as the stable identity for one evolving plan or one evolving creative in one format. Store:

- `id`, `artifactType` (`plan` or `creative`)
- denormalized `workspaceId`, `clientProfileId`, `campaignId`, `threadId`
- `originalArtifactId` and explicit legacy/native origin
- creative-only `formatKey` where applicable
- timestamps

Use a unique adoption key for the original artifact so concurrent lazy adoption cannot assign one source artifact to two editable thread-owned lineages. Another thread may still read the original plan or derivation through existing campaign permissions, but all reads and mutations of the version lineage require the owning thread scope.

### 2. Immutable artifact versions

Create `assistant_artifact_versions` with:

- `id`, `lineageId`, monotonic `versionNumber`
- nullable `sourceVersionId` for `v1`, otherwise exact parent
- lifecycle `status`
- typed allowlisted `snapshot`
- typed allowlisted `provenance`
- optional bounded triggering feedback text/reference
- `createdAt`

Enforce unique `(lineageId, versionNumber)`. Treat snapshot, source, provenance, feedback, and version number as immutable after insert. Lifecycle status may advance through a narrow transition service if queued/failed creative versions are introduced in Phase 205; it must not rewrite snapshot content.

### 3. Lineage head

Create `assistant_artifact_lineage_heads` with one row per lineage:

- `lineageId` primary/unique key
- nullable `approvedCurrentVersionId`
- nullable `workingVersionId`
- integer `revision`
- `updatedAt`

Keeping head state separate avoids circular schema ownership and keeps immutable version rows untouched. Promotion updates one pointer under CAS in a transaction. One pointer column naturally guarantees at most one approved current version; the nullable state supports lineages awaiting first approval.

### 4. Pending proposal records

Create a minimal `assistant_artifact_proposals` persistence contract now because VERS-04 and the locked context require resumable multiple proposals:

- scope and `lineageId`
- exact `sourceVersionId`
- proposal type (`plan_revision` or `creative_revision`)
- status (`pending`, `stale`, `confirmed`, `canceled`)
- allowlisted proposal payload and bounded feedback
- timestamps

Phase 203 should implement storage/query/stale primitives, not semantic proposal generation. Phase 204 and 205 will define the actual plan and creative payload schemas and confirmation behavior.

## Snapshot Contracts

Use discriminated Zod schemas in shared server-safe code.

### Plan snapshot allowlist

- strategy
- angles
- hooks
- CTAs
- campaign constraints needed to reproduce the approved plan
- source plan status only when it has product meaning

Normalize nullable arrays and text before hashing/persisting. Do not persist arbitrary campaign JSON.

### Creative snapshot allowlist

- original derivation ID
- stable internal output object key, never a signed URL
- format and generation mode
- CTA text
- exact plan version ID when available
- bounded safe creative-contract fields needed for provenance
- safe quality/review status summaries only when explicitly allowlisted

Do not copy `prompt`, `inputPrompt`, provider responses, generation logs, signed previews, raw tool arguments, or reasoning fields.

### Provenance allowlist

- origin (`legacy_import`, `native`, `revision`)
- source artifact/version IDs
- assistant message/action IDs when present
- safe feedback reference/text
- generation mode, format, and plan version reference where relevant

Apply both a positive schema allowlist and the existing recursive denylist. The positive schema prevents unknown fields from surviving parsing; the denylist is defense in depth.

## Lazy Legacy Adoption

Adoption should be a transaction:

1. Resolve authenticated thread and verify workspace/client/campaign scope.
2. Load the source plan or derivation under workspace and campaign.
3. Check the unique source-artifact adoption key.
4. Build a typed snapshot and explicit `legacy_import` provenance.
5. Insert lineage, `v1`, and head.
6. Mirror existing approval into `approvedCurrentVersionId`; otherwise leave it null.
7. Set `workingVersionId` to `v1`.

Handle a unique-race by reading only enough ownership metadata to return a safe conflict. Never expose the winning lineage history or silently transfer ownership to the second thread.

## Resume Projection

Extend the authenticated thread read model with a bounded artifact-version projection:

- each thread-owned lineage
- approved current and working version summaries
- recent immutable version history with source/status/time/feedback/provenance
- pending proposals grouped by lineage, newest first
- linked derivation generation status when applicable

Do not put full histories into guided-flow `slots`. Query canonical version tables and return a typed projection. This prevents stale duplicated state and keeps reload deterministic. Unsubmitted composer feedback remains client-local and thread-keyed; it is outside server persistence.

## Concurrency and Invariants

- Use head `revision` CAS for working-selection and approved-current changes.
- Validate that both target pointers belong to the same scoped lineage inside the transaction.
- Require promotion before revising an older version; child creation must use the current approved source expected by the caller.
- When a proposal is confirmed later, stale sibling proposals sharing the same source version in the same artifact queue.
- Keep plan lineage per thread and creative lineage per selected creative plus format.
- Batch alternatives receive separate lineages.

## API and Repository Boundaries

Recommended modules:

- `app/src/lib/assistant/artifact-version.ts`: shared DTOs and discriminated schemas without server imports.
- `app/src/server/assistant/artifact-version/snapshots.ts`: source-to-safe-snapshot builders.
- `app/src/server/repositories/artifact-version.ts`: scoped CRUD, CAS head mutation, immutable inserts, proposal queue primitives.
- `app/src/server/assistant/artifact-version/service.ts`: scope resolution, lazy adoption, history/resume projection.
- authenticated nested routes under `/api/assistant/threads/[threadId]/artifact-versions` for adoption/history/head operations, or inclusion in the existing thread GET projection where practical.

Keep route handlers thin. Repositories own database invariants; services own cross-table source validation and projection.

## Risks and Mitigations

### Scope drift between denormalized IDs

Risk: a caller supplies a valid workspace/thread but mismatched campaign or client.

Mitigation: resolve thread first, require exact client/campaign equality, resolve source artifact under the same workspace/campaign, and include all scope predicates in repository reads.

### False immutability

Risk: generic update helpers later mutate snapshots.

Mitigation: expose no snapshot update API; test that repository transitions only update head/proposal/lifecycle fields. Consider a database trigger only if repository-only enforcement proves insufficient; it is not required for the first implementation.

### Current-pointer race

Risk: two tabs promote different versions.

Mitigation: one head row plus revision CAS. The loser receives a typed conflict and fresh projection.

### Unsafe JSON copied from derivations

Risk: prompt/provider fields leak into snapshot or API response.

Mitigation: construct new allowlisted objects field-by-field, parse with strict schemas, run recursive denylist checks, and add adversarial tests containing nested denied keys.

### Legacy adoption race

Risk: two threads adopt the same artifact simultaneously.

Mitigation: unique original-artifact key, transactional adoption, deterministic read-after-conflict, and read-only behavior for non-owner threads.

## Validation Architecture

### Test layers

1. **Contract tests:** strict plan/creative snapshot parsing; nested denylist rejection; unknown field stripping/rejection; safe projection DTOs.
2. **Repository tests:** immutable inserts, monotonic numbering, source lineage validation, scope rejection, proposal ordering/status, and CAS head conflicts.
3. **Service tests:** lazy plan/creative adoption, mirrored approval, separate format/batch lineages, cross-thread ownership rejection, and idempotent concurrent adoption behavior.
4. **Route/thread projection tests:** authenticated scope derivation, history response, approved/working pointers, pending queues, and conflict responses.
5. **Build/typecheck:** Next production build catches server/client import leaks and route-module export errors.

### Fast feedback commands

```bash
cd app && npm test -- --run src/lib/assistant/artifact-version.test.ts src/server/repositories/artifact-version.test.ts src/server/assistant/artifact-version/service.test.ts
```

```bash
cd app && npm test -- --run src/app/api/assistant/threads/[threadId]/artifact-versions/route.test.ts src/app/api/assistant/threads/[threadId]/route.test.ts
```

### Full phase gate

```bash
cd app && npm test -- --run src/lib/assistant/artifact-version.test.ts src/server/repositories/artifact-version.test.ts src/server/assistant/artifact-version/service.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/route.test.ts src/app/api/assistant/threads/[threadId]/route.test.ts && npm run build
```

All Phase 203 behaviors are automatable. No manual-only verification is required because this phase exposes persistence and authenticated contracts rather than final visual interaction.

## Planning Recommendation

Use two sequential plans:

1. **Version model and invariants:** contracts, migration, safe snapshots, repository, CAS, scope and immutability tests.
2. **Adoption and resume projection:** lazy legacy adoption, proposal queues, thread/API projection, conflict behavior, and integration tests.

This split creates a stable persistence boundary before integrating it into the assistant thread read model.
