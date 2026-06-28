# Phase 206: Version Compare and Approval - Research

**Researched:** 2026-06-28
**Domain:** Scoped artifact comparison, atomic canonical promotion, and assistant comparison UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Comparison entry and version selection
- **D-01:** Version history lives persistently in the assistant context panel, with shortcuts from chat messages that created a version.
- **D-02:** Opening comparison preselects approved current versus working selection when they differ. If there is no distinct pair, the user chooses the second version explicitly.
- **D-03:** Detailed comparison opens in a wide responsive surface over the chat and restores the user's chat scroll position when closed.
- **D-04:** History is a linear timeline, not a branch tree. Each entry identifies version number, approved/working/previously-approved status, creation time, origin, and feedback summary.
- **D-05:** Selection and comparison are restricted to two versions from the same lineage and never mutate approved or working pointers.

### Semantic plan comparison
- **D-06:** Show changed fields by default and provide a control to reveal unchanged fields.
- **D-07:** Render each changed field as before/after: two columns on desktop and stacked sections on mobile, with additions, removals, edits, and moves distinguished.
- **D-08:** Ordering is semantically meaningful for angles, hooks, and CTAs. Reordering must appear as a change rather than being normalized away.
- **D-09:** Compare fields in the canonical plan order: strategy, angles, hooks, CTAs, constraints.
- **D-10:** The comparison header shows version number, status, date, and triggering feedback. Internal IDs and technical provenance stay out of the primary user surface.

### Visual creative comparison
- **D-11:** Show previews side by side on desktop and stacked on mobile, with persistent headers identifying each version.
- **D-12:** Start with the complete image fitted in view. Zoom and pan are synchronized so both previews inspect the corresponding region.
- **D-13:** Show decision-relevant metadata: version/status, format and dimensions, bound plan version, CTA, date, and triggering feedback. Hide technical IDs.
- **D-14:** Explain changes using persisted triggering feedback and intended changes, explicitly labeled as intent. Do not run a new visual AI analysis or claim detected pixel-level differences.
- **D-15:** If a preview cannot be loaded, retain the version and safe metadata in the comparison with a recoverable preview error; do not substitute a signed URL into persisted state.

### Approval, promotion, and conflicts
- **D-16:** Approving or promoting synchronizes the lineage approved-current pointer and the canonical plan/creative used outside the assistant in one operation, while immutable version snapshots and history remain unchanged.
- **D-17:** Promotion requires an explicit no-credit confirmation modal showing current version to selected version, canonical writes, and proposals that will become stale.
- **D-18:** Eligible targets are `ready` or previously approved versions. Pending, running, failed, canceled, invalid, cross-lineage, or cross-scope versions cannot be promoted.
- **D-19:** After promotion, the promoted version becomes both approved current and working selection; the prior official version is labeled previously approved; proposals based on the prior head become stale rather than being deleted.
- **D-20:** A creative promotion also promotes the exact plan version that generated it. This is a compound all-or-nothing operation: both artifacts are validated and updated atomically, or neither changes.
- **D-21:** Before compound creative+plan promotion is enabled, the user must separately open and review the comparison for the linked plan version against the current official plan.
- **D-22:** The compound confirmation must identify both plan and creative transitions and must not charge credits.
- **D-23:** On revision/CAS conflict, reload canonical state, keep the comparison open, explain what changed, and require a fresh confirmation. Never auto-retry promotion against the new head.

### the agent's Discretion
- Exact component split for timeline, selectors, wide comparison surface, plan diff blocks, image viewer, and confirmation modal.
- Exact API route names and request envelopes, provided selection is read-only and promotion uses scoped revision checks.
- How the mandatory linked-plan comparison is represented as a server-verifiable acknowledgement rather than a client-only flag.
- Exact mechanism used to resolve short-lived preview URLs at read time.
- Copy, icons, spacing, loading skeletons, and accessible keyboard/focus behavior consistent with existing assistant UI patterns.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 206 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMP-01 | User can select and compare two versions from the same artifact lineage. | Add a scoped comparison presenter that accepts one lineage and two distinct version IDs, then returns a sanitized read-only DTO; reuse the existing lineage/version repository and context panel. [VERIFIED: `.planning/REQUIREMENTS.md`, `app/src/server/repositories/artifact-version.ts`] |
| COMP-02 | Plan comparison shows semantic field changes; creative comparison shows actual previews plus safe metadata and change summary. | Replace order-insensitive list comparison with an order-aware pure comparator; resolve creative preview URLs at read time and source intent from persisted feedback/proposal payload. [VERIFIED: `app/src/server/assistant/plan-iteration/diff.ts`, `app/src/lib/assistant/artifact-version.ts`] |
| APPR-01 | User can approve a ready version as current without spending credits. | Implement promotion as a DB transaction over lineage head, canonical artifact, proposal state, and approval history; do not call billing. [VERIFIED: `app/src/server/repositories/artifact-version.ts`, `app/src/server/repositories/plan.ts`, `app/src/server/repositories/derivation.ts`] |
| APPR-02 | User can promote an older version as current without deleting newer versions or descendants. | Keep version rows immutable, append approval history, and update only pointers/canonical mutable rows. [VERIFIED: `app/src/server/db/schema.ts`, Phase 203 verification] |
| APPR-03 | User cannot approve a stale, superseded, cross-lineage, or conflicting version. | Use an explicit status allowlist, four-dimensional scope checks, lineage membership checks, expected head revisions, and a non-retrying 409 recovery payload. [VERIFIED: `app/src/server/repositories/artifact-version.ts`, `206-CONTEXT.md`] |
</phase_requirements>

## Summary

Phase 206 should extend the existing version model, not replace it. The repository already provides immutable snapshots, four-dimensional scope, separate approved/working pointers, and revision CAS. The missing domain pieces are: a sanitized comparison DTO, order-aware plan diffing, append-only approval history for “previously approved,” a persisted linked-plan comparison acknowledgement, and one transaction that synchronizes lineage heads with mutable campaign records. [VERIFIED: `app/src/lib/assistant/artifact-version.ts`, `app/src/server/repositories/artifact-version.ts`, `app/src/server/assistant/artifact-version/service.ts`]

The highest-risk area is promotion, not rendering. `updateArtifactHead` currently runs independently and the canonical plan/derivation repositories update independently, so composing them in a service would allow partial success. Promotion therefore belongs in one repository transaction that performs both CAS updates for a compound creative approval, canonical writes, proposal staling, and approval-event insertion before commit. Any CAS miss must throw and roll back the entire operation. [VERIFIED: `app/src/server/repositories/artifact-version.ts`, `app/src/server/repositories/plan.ts`, `app/src/server/repositories/derivation.ts`]

The client also has a concrete integration gap: `/api/assistant/threads/[threadId]` already returns `artifactVersionState`, but `fetchAssistantThread` drops it. Phase 206 must first type and preserve that field or the context timeline will remain empty despite a correct backend. [VERIFIED: `app/src/app/api/assistant/threads/[threadId]/route.ts`, `app/src/lib/hooks/use-assistant-threads.ts`]

**Primary recommendation:** Build one comparison/promotion domain module over the existing tables, add only the two persistence concepts the current model cannot derive (approval events and linked-plan review acknowledgements), then compose the UI from existing Dialog/Select/Button/Badge/Skeleton primitives. [VERIFIED: codebase and `206-UI-SPEC.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Same-lineage selection and comparison validation | API / Backend | Browser / Client | Server is authoritative for scope and lineage; client filters only for UX. [VERIFIED: existing scoped repository pattern] |
| Plan semantic diff | API / Backend | Browser / Client | One server-computed semantic result prevents client normalization drift; UI only renders it. [VERIFIED: Phase 204 pattern] |
| Creative preview and safe metadata | API / Backend | Browser / Client | Server resolves short-lived URLs and strips output keys/provider data; browser displays the returned view model. [VERIFIED: storage and snapshot patterns] |
| Shared zoom/pan | Browser / Client | — | It is transient presentation state and must not be persisted. [VERIFIED: `206-CONTEXT.md`] |
| Promotion eligibility and compound approval | API / Backend | Database / Storage | Eligibility, CAS, and all-or-nothing canonical writes are server-owned. [VERIFIED: Phase 203 CAS model] |
| Approval history and linked-plan review receipt | Database / Storage | API / Backend | Both must remain server-verifiable across requests and reloads. [VERIFIED: D-04, D-21] |
| Timeline and modal orchestration | Browser / Client | API / Backend | Client owns selection/focus/scroll; API owns canonical state. [VERIFIED: `206-UI-SPEC.md`] |

## Standard Stack

### Core

| Library / Feature | Installed Version | Purpose | Why Standard Here |
|-------------------|-------------------|---------|-------------------|
| Next.js App Router | 16.2.6 | Authenticated comparison/promotion routes | Existing route boundary and error pattern. [VERIFIED: `app/package.json`] |
| React | 19.2.4 | Timeline, comparison workspace, shared viewer state | Existing assistant UI runtime. [VERIFIED: `app/package.json`] |
| Zod | ^3.0.0 | Strict request/response/domain contracts | Existing artifact snapshots and route bodies are strict Zod schemas. [VERIFIED: `app/package.json`, `artifact-version.ts`] |
| Drizzle ORM | ^0.45.2 | Scoped reads and atomic multi-table transaction | Existing version repository and migrations use Drizzle. [VERIFIED: `app/package.json`, `artifact-version.ts`] |
| TanStack Query | ^5.100.1 | Comparison fetch/mutation and canonical-state invalidation | Existing assistant hooks already share query keys and invalidation. [VERIFIED: `app/package.json`, `use-assistant-threads.ts`] |
| Existing Base UI/shadcn primitives | @base-ui/react ^1.4.1 | Wide dialog, nested confirmation, selectors and focus trap | UI spec explicitly requires reuse and forbids a second modal system. [VERIFIED: `206-UI-SPEC.md`, `components/ui/dialog.tsx`] |

### Supporting

| Existing Module | Purpose | Use |
|-----------------|---------|-----|
| `getPresignedDownloadUrl` / object storage | Short-lived creative previews | Resolve from persisted `outputKey` only at read time; return URL in response, never write it. [VERIFIED: campaign derivation routes and R2 storage] |
| `getTargetDimensions` | Safe format dimensions | Derive display dimensions from persisted format without reading image bytes. [VERIFIED: `app/src/lib/formats.ts`] |
| Lucide | Accessible compare/status/zoom icons | Reuse the installed icon set with visible text/ARIA names. [VERIFIED: `app/package.json`, UI spec] |
| Vitest + Testing Library | Domain, route, hook, and component checks | Existing split node/jsdom projects cover all Phase 206 non-browser behavior. [VERIFIED: `app/config/vitest.config.ts`] |

**Installation:** None. No new package is needed or permitted by the UI contract. [VERIFIED: `206-UI-SPEC.md`]

## Architecture Patterns

### System Architecture Diagram

```text
Context timeline / action-card shortcut
  -> comparison workspace selects lineage + version A/B
  -> authenticated comparison API derives thread scope
     -> validate one lineage + two distinct scoped versions
     -> plan: order-aware semantic comparator
     -> creative: safe presenter + read-time preview URLs + persisted intent
  -> read-only render (no pointer mutation)

Promotion CTA
  -> effect preview + explicit confirmation
  -> authenticated promotion API derives thread scope
     -> validate target status, lineage, head revisions, linked plan receipt
     -> ONE database transaction
        -> CAS plan head (compound creative only)
        -> CAS creative/plan target head
        -> copy immutable plan snapshot to creative_plans + campaign constraints
        -> update canonical derivation approval status
        -> stale affected pending proposals
        -> append approval event(s)
     -> success: return refreshed sanitized state
     -> CAS miss: rollback -> 409 refreshed state -> user reviews and confirms again
```

### Recommended Project Structure

```text
app/src/
├── lib/assistant/artifact-version.ts                  # comparison/promotion DTO schemas
├── server/assistant/artifact-version/comparison.ts    # presenters + plan semantic diff
├── server/assistant/artifact-version/promotion.ts     # eligibility/effect preview facade
├── server/repositories/artifact-version.ts            # atomic promotion transaction
├── app/api/assistant/threads/[threadId]/artifact-versions/
│   ├── compare/route.ts
│   ├── comparison-acknowledgements/route.ts
│   └── promote/route.ts
├── components/assistant/VersionHistory.tsx
├── components/assistant/VersionComparisonDialog.tsx
└── lib/hooks/use-assistant-artifact-versions.ts
```

Keep the split small: pure domain/presenter, transaction boundary, routes, and UI composition. Do not create factories, generic diff engines, or a second state store. [VERIFIED: current project conventions; ponytail constraint]

### Pattern 1: Sanitized Read Model

Return a comparison-specific DTO instead of passing `ArtifactVersionSummary` directly into the UI. The existing creative snapshot intentionally persists `outputKey`, `derivationId`, and provenance IDs; the primary comparison surface must not render those technical fields. A presenter should output labels, dates, feedback, safe metadata, and ephemeral `previewUrl` only. [VERIFIED: `artifact-version.ts`, D-10, D-13, D-15]

### Pattern 2: Order-Aware Plan Diff

Preserve canonical field order and list order. The current `normalizeList(...).sort()` makes pure reorders compare equal, directly contradicting D-08. Replace it with a pure comparator that trims values without sorting, classifies scalar null/value transitions as add/remove/edit, and uses occurrence-aware matching for list items so duplicates and moves remain deterministic. A small LCS-based matcher is sufficient; unmatched old/new items become remove/add or edit, and equal matched values with different indices become moves. [VERIFIED: `plan-iteration/diff.ts`, D-07 through D-09]

### Pattern 3: Atomic Promotion Transaction

The transaction input must include scope, target IDs, and expected revisions for every head being changed. Re-read all target versions and lineages inside the transaction, check status allowlists, then perform conditional head updates. For compound creative promotion, update the plan head and creative head in the same transaction; throwing after either zero-row CAS rolls back both. [VERIFIED: existing CAS and Drizzle transaction patterns]

Plan canonical sync must copy `strategy`, `angles`, `hooks`, and `ctas` into the original `creative_plans` row, set it approved, and copy snapshot `constraints` into the campaign row because constraints are not stored on `creative_plans`. Creative canonical sync must approve the target snapshot's derivation and demote only the previous official derivation in that lineage to a non-approved completed state. [VERIFIED: `schema.ts`, `plan.ts`, `derivation.ts`]

### Pattern 4: Append-Only Approval History

The current head stores only the present approved version. Once a ready version is promoted and later replaced, neither its immutable status nor the current head can prove it was previously approved. Add a scoped append-only approval-event table with operation ID, lineage ID, promoted version ID, previous version ID, artifact type, and timestamp. The timeline derives “previously approved” from events plus legacy `status === "approved"`. [VERIFIED: current schema; D-04, D-19]

### Pattern 5: Server-Verifiable Linked-Plan Review

Persist a narrow comparison acknowledgement bound to workspace/client/campaign/thread, creative target version, linked plan version, compared current plan version, plan lineage ID, and plan head revision. Promotion accepts the acknowledgement ID, reloads it in scope, and rejects it if versions or revision no longer match. A client boolean or unsigned token is insufficient; a generic assistant action record would pollute the action lifecycle. [VERIFIED: D-21, existing scoped persistence model]

### Pattern 6: Recoverable Conflict

Return HTTP 409 with a typed code plus refreshed sanitized lineage state and old/new official labels. The mutation hook must keep the dialog open, invalidate any confirmation and linked-plan acknowledgement, preserve the target only if still eligible, focus the alert, and never automatically call mutate again. [VERIFIED: D-23, existing `ArtifactHeadConflictError`]

### Anti-Patterns to Avoid

- **Calling `updateArtifactHead`, `updatePlanStatus`, and `updateDerivationStatus` sequentially:** these functions do not share a transaction and permit partial promotion. [VERIFIED: repository code]
- **Reusing the current sorted Phase 204 diff:** it hides moves. [VERIFIED: `diff.ts`]
- **Persisting signed preview URLs:** they expire and violate the snapshot safety contract. [VERIFIED: D-15 and R2 300-second URL behavior]
- **Inferring previously approved from version number or current status:** ready versions retain ready status and the head only stores one current ID. [VERIFIED: schema]
- **Treating linked-plan review as local React state:** it cannot be verified by the promotion endpoint and survives neither reload nor conflict. [VERIFIED: D-21]
- **Auto-retrying CAS:** the user would confirm against a different official version than the one reviewed. [VERIFIED: D-23]
- **Mutating immutable version snapshots to mark approval:** pointer/history state belongs in heads and append-only approval events. [VERIFIED: Phase 203 invariant]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal/focus trap | New overlay or focus manager | Existing `Dialog` primitives | Already handles portal, overlay, focus and close semantics. [VERIFIED: `dialog.tsx`] |
| Server cache/state | New client store | Existing TanStack Query keys/invalidation | Canonical state already enters through thread queries. [VERIFIED: hooks] |
| Preview URL storage | URL refresh table | Existing object-storage presigner at read time | URLs are intentionally short lived. [VERIFIED: storage] |
| Image dimensions | Downloading and parsing each image | `getTargetDimensions(format)` | Format contract already supplies display dimensions. [VERIFIED: `formats.ts`] |
| Generic visual diff | Pixel-diff or new AI call | Persisted feedback + intended changes | Locked D-14 forbids detected-difference claims. [VERIFIED: D-14] |
| Diff dependency | Third-party diff package | Small pure order-aware comparator | Domain has five bounded fields and three bounded lists; no package is justified. [VERIFIED: schemas]

## Common Pitfalls

### Pitfall 1: Timeline Data Never Reaches React
**What goes wrong:** Backend returns version state but the context panel sees none.  
**Why:** `fetchAssistantThread` currently omits `artifactVersionState` when mapping JSON.  
**Avoid:** Extend `AssistantThreadDetail`, coerce dates in nested versions/proposals, and preserve the field before building timeline UI. [VERIFIED: route and hook]

### Pitfall 2: “Previously Approved” Cannot Be Reconstructed
**What goes wrong:** A promoted ready version later appears as ordinary ready history.  
**Why:** The schema only records the current approved pointer and immutable creation status.  
**Avoid:** Append approval events in the same transaction and include derived history flags in presentation. [VERIFIED: schema]

### Pitfall 3: Canonical Plan Is Split Across Tables
**What goes wrong:** Strategy/angles update but constraints outside the assistant remain stale.  
**Why:** plan snapshots include constraints; `creative_plans` does not. Campaign owns constraints.  
**Avoid:** Update both `creative_plans` and `campaigns.constraints` atomically. [VERIFIED: snapshot and schema]

### Pitfall 4: Creative Intent Summary Is Lost
**What goes wrong:** Compare UI shows only raw feedback and omits structured intended changes.  
**Why:** Intended changes live in the confirmed proposal payload; the version carries `actionId`, not `proposalId`.  
**Avoid:** Resolve version provenance `actionId` -> assistant action `inputSnapshot.proposalId` -> confirmed proposal, and fail safely to feedback-only for legacy versions. [VERIFIED: creative proposal/action/version code]

### Pitfall 5: Legacy Creative Has No Exact Plan Binding
**What goes wrong:** Compound approval guesses a plan for an adopted creative.  
**Why:** legacy creative adoption writes `planVersionId: null`; D-20 requires the exact generating plan.  
**Avoid:** Fail closed for compound promotion when the creative snapshot lacks `planVersionId`; do not infer historical plan identity. Existing already-official legacy creatives may remain official. [VERIFIED: `service.ts`, `snapshots.ts`, D-20]

### Pitfall 6: Proposal Staling Is Incomplete
**What goes wrong:** Promotion changes the official head but old-head proposals remain confirmable.  
**Why:** Existing helper stales only siblings during confirmation; plan-bound creative proposals use JSON `planVersionId`.  
**Avoid:** Promotion effect preview and transaction must include direct proposals based on the prior artifact head and creative proposals bound to a replaced plan version. [VERIFIED: repository and Phase 205 service]

### Pitfall 7: Scroll Restoration Targets the Wrong Element
**What goes wrong:** closing the dialog restores page position but not chat position.  
**Why:** `AssistantMessageList` is the actual `overflow-y-auto` container.  
**Avoid:** register its element/ref with `AssistantSurfaceContext`, capture `scrollTop` before open, and restore after close. [VERIFIED: `AssistantMessageList.tsx`, `AssistantSurfaceContext.tsx`]

### Pitfall 8: Conflict Response Leaks or Reuses Stale Confirmation
**What goes wrong:** raw DB head IDs are surfaced or prior confirmation is reused.  
**Avoid:** map conflicts through the sanitized presenter, clear confirmation/acknowledgement, and require a new explicit submit. [VERIFIED: D-23]

## Code Examples

### Promotion Transaction Shape

```typescript
// Project pattern: app/src/server/repositories/artifact-version.ts
return db.transaction(async (tx) => {
  const planHead = await casHead(tx, input.plan, input.expectedPlanRevision);
  if (!planHead) throw new ArtifactHeadConflictError("Plan head changed", null);

  const creativeHead = await casHead(
    tx,
    input.creative,
    input.expectedCreativeRevision
  );
  if (!creativeHead) throw new ArtifactHeadConflictError("Creative head changed", null);

  await syncCanonicalPlan(tx, input.planTarget.snapshot);
  await syncCanonicalCreative(tx, input.creativeTarget.snapshot);
  await staleAffectedProposals(tx, input.effects.proposalIds);
  await appendApprovalEvents(tx, input.operationId, input.transitions);
});
```

The actual implementation should validate scoped rows inside the transaction and return a refreshed presentation after commit, not from transaction-local partially mapped state. [VERIFIED: project transaction conventions]

### Read-Time Preview Resolution

```typescript
const previewUrl = snapshot.outputKey
  ? await getPresignedDownloadUrl(snapshot.outputKey)
  : null;

return {
  versionLabel: `v${version.versionNumber}`,
  previewUrl,
  format: snapshot.format,
  dimensions: snapshot.format ? getTargetDimensions(snapshot.format) : null,
  cta: snapshot.ctaText,
  intendedChanges,
};
```

`previewUrl` is response-only and excluded from every persisted schema. [VERIFIED: D-15]

## State of the Art

| Existing Approach | Phase 206 Approach | Impact |
|-------------------|--------------------|--------|
| Field-level plan summary with sorted lists | Order-aware before/after semantic DTO | Reorders become visible and testable. [VERIFIED: current diff] |
| Thread API exposes raw artifact version presentation | Comparison route exposes sanitized presentation | UI gets only decision-relevant data plus ephemeral preview URLs. [VERIFIED: current route/types] |
| One current approved pointer, no historical event | Pointer plus append-only approval events | “Previously approved” remains truthful after repeated promotion. [VERIFIED: schema gap] |
| Independent head/canonical update functions | One multi-table CAS transaction | Prevents partial plan/creative promotion. [VERIFIED: repository gap] |
| No plan-review proof | Revision-bound scoped acknowledgement | Compound creative approval is server-verifiable. [VERIFIED: D-21] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Demoting a previous canonical creative to `completed` is compatible with all outside-assistant consumers. | Atomic promotion | Some consumer may require multiple lineage versions to remain `approved`; verify call sites during planning. |
| A2 | Format-derived target dimensions are the intended metadata; exact decoded pixel dimensions are not required. | Standard Stack | If exact bytes are required, generation must persist dimensions for future versions and legacy entries need a fallback. |

All other implementation claims are verified from current repository files or locked phase documents. The two assumptions above should become explicit planner acceptance criteria, not silent choices.

## Open Questions

1. **Canonical creative demotion semantics**
   - What we know: outside-assistant creative approval is represented by `derivations.status === "approved"`; multiple formats/lineages can legitimately be approved. [VERIFIED: derivation repository]
   - Gap: there is no lineage ID on `derivations`, so only the previous version snapshot identifies which record to demote.
   - Recommendation: demote only the prior approved-current snapshot's derivation to `completed`, never other campaign derivations; lock this in transaction tests.

2. **Exact vs target dimensions**
   - What we know: `getTargetDimensions` provides canonical dimensions per format; derivation rows do not persist width/height. [VERIFIED: schema and formats]
   - Recommendation: label/display format contract dimensions in Phase 206. Do not download and inspect images during comparison unless product explicitly requires actual decoded pixels.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | tests/build/migrations | ✓ | 25.9.0 | Project runtime configuration governs deployment version. [VERIFIED: local command] |
| npm | tests/build | ✓ | 11.12.1 | — [VERIFIED: local command] |
| PostgreSQL/Drizzle migration path | approval history and acknowledgements | Existing project path | Drizzle ^0.45.2 | No in-memory fallback; migration is required before deploy. [VERIFIED: package and migrations] |
| R2-compatible object storage | creative preview URLs | Existing abstraction | Existing configured service | Preview failure remains recoverable and metadata stays visible. [VERIFIED: D-15] |

No new external dependency or service is required.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 with node and jsdom projects; Testing Library 16.3.2 [VERIFIED: `app/package.json`] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- --run src/server/assistant/artifact-version/comparison.test.ts src/server/assistant/artifact-version/promotion.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/route.test.ts src/components/assistant/VersionComparisonDialog.test.tsx` |
| Full suite command | `cd app && npm test` |

Current focused baseline: 6 files / 42 tests pass for artifact schemas, repository invariants, service, Phase 204 diff, artifact-version route, and action card. [VERIFIED: test run 2026-06-28]

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMP-01 | Reject same version, cross-lineage, and cross-scope pairs; valid pair is read-only | service + route | `npm test -- --run src/server/assistant/artifact-version/comparison.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts` | ❌ Wave 0 |
| COMP-02 | Plan adds/removes/edits/moves in canonical order; creative response contains previews, safe metadata and intent only | unit + component | `npm test -- --run src/server/assistant/artifact-version/comparison.test.ts src/components/assistant/VersionComparisonDialog.test.tsx` | ❌ Wave 0 |
| APPR-01 | Ready target becomes approved+working and canonical plan/creative updates without billing | repository + service + route | `npm test -- --run src/server/assistant/artifact-version/promotion.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts` | ❌ Wave 0 |
| APPR-02 | Older eligible version promotes; newer versions/descendants remain; prior official gets historical label | repository + presentation | `npm test -- --run src/server/assistant/artifact-version/promotion.test.ts src/server/assistant/artifact-version/service.test.ts` | service file exists; promotion cases ❌ |
| APPR-03 | Invalid statuses, missing receipt, stale receipt, scope mismatch, and single/compound CAS conflicts reject with rollback/recovery state | repository + route + component | `npm test -- --run src/server/assistant/artifact-version/promotion.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts src/components/assistant/VersionComparisonDialog.test.tsx` | ❌ Wave 0 |

### Critical Transaction Tests

- Plan canonical write failure rolls back head update and approval event.
- Creative CAS failure after plan CAS rolls back plan head and both canonical writes.
- Head conflict returns 409 and current official labels; no automatic second mutation occurs.
- Acknowledgement with old plan head revision is rejected after any plan promotion.
- Cross-thread/client/campaign/workspace version IDs fail before mutation.
- Promotion never deletes or updates immutable `assistant_artifact_versions` snapshots.
- No billing/credit function is imported or called by comparison/promotion modules.

Repository tests today cover pure invariants only, not real transaction rollback. Add a DB-backed integration test if the existing test database is available; otherwise keep repository SQL in one function and verify rollback through a transaction-capable mock plus route/service tests. [VERIFIED: current `artifact-version.test.ts`]

### Sampling Rate

- **Per task commit:** requirement-specific Vitest file(s), under 30 seconds.
- **Per wave merge:** `cd app && npm test -- --run src/server/assistant/artifact-version/ src/server/repositories/artifact-version.test.ts src/app/api/assistant/threads/[threadId]/artifact-versions/ src/components/assistant/Version*.test.tsx src/lib/hooks/use-assistant-threads.test.tsx`
- **Phase gate:** `cd app && npm test && npx tsc --noEmit --pretty false && npm run build`
- **Browser/UAT:** Full authenticated desktop/mobile workflow is explicitly Phase 207; Phase 206 still needs jsdom accessibility/focus/conflict tests. [VERIFIED: roadmap]

### Wave 0 Gaps

- [ ] `src/server/assistant/artifact-version/comparison.test.ts` — COMP-01/COMP-02 semantic and sanitization contract.
- [ ] `src/server/assistant/artifact-version/promotion.test.ts` — APPR-01/APPR-02/APPR-03 eligibility, atomicity, history, compound behavior.
- [ ] `src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts` — auth/scope/read-only/error mapping.
- [ ] `src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts` — strict body, 409 recovery, no-credit response.
- [ ] `src/components/assistant/VersionHistory.test.tsx` and `VersionComparisonDialog.test.tsx` — selection, labels, diff rendering, preview failure, confirmation, conflict focus.
- [ ] Extend `src/lib/hooks/use-assistant-threads.test.tsx` so `artifactVersionState` is preserved and nested dates are parsed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireWorkspaceAccess` on every route. [VERIFIED: existing route] |
| V3 Session Management | yes | Existing Better Auth/session cookie path; no new token system. [VERIFIED: package/auth pattern] |
| V4 Access Control | yes | Derive workspace/thread scope server-side and enforce workspace+client+campaign+thread+lineage on every ID. [VERIFIED: repository scope predicates] |
| V5 Input Validation | yes | Strict Zod bodies/DTOs; status allowlist; distinct-version and lineage checks. [VERIFIED: project pattern] |
| V6 Cryptography | no custom crypto | Persist review acknowledgements rather than inventing unsigned/signed client tokens. [VERIFIED: recommendation] |
| V8 Data Protection | yes | Never return prompts/provider payloads; signed URLs are ephemeral and never persisted. [VERIFIED: snapshot denylist, D-15] |
| V11 Business Logic | yes | CAS, status allowlist, compound rollback, no credit calls, and explicit confirmation. [VERIFIED: requirements] |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via supplied lineage/version/receipt IDs | Elevation of privilege | Server-derived scope plus scoped queries and lineage membership checks. |
| Stale approval race | Tampering | Expected revision CAS for each changed head inside one transaction. |
| Partial compound promotion | Tampering | Throw/rollback on either plan or creative CAS/canonical failure. |
| Signed URL leakage/persistence | Information disclosure | Response-only short-lived URLs and sanitized DTOs. |
| Client-forged plan-review flag | Spoofing | Scoped, revision-bound acknowledgement row. |
| Unsafe status promotion | Tampering | Explicit eligible-status allowlist; fail closed on unknown values. |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/206-version-compare-and-approval/206-CONTEXT.md` — locked comparison, promotion, compound and conflict decisions.
- `.planning/phases/206-version-compare-and-approval/206-UI-SPEC.md` — UI, responsive, accessibility, copy and registry contract.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — COMP/APPR acceptance boundaries and Phase 207 deferrals.
- `app/src/lib/assistant/artifact-version.ts` — persisted snapshot/provenance/presentation schemas.
- `app/src/server/repositories/artifact-version.ts` — scope, immutable reads, proposal lifecycle and CAS.
- `app/src/server/assistant/artifact-version/service.ts` — adoption and thread presentation.
- `app/src/server/assistant/plan-iteration/diff.ts` — current order-insensitive diff behavior.
- `app/src/server/db/schema.ts` — artifact heads, canonical plan/campaign/derivation storage split.
- `app/src/lib/hooks/use-assistant-threads.ts` and thread API route — cross-layer presentation gap.
- `app/src/components/ui/dialog.tsx`, assistant context/chat/surface components — existing UI composition and scroll owner.
- `app/config/vitest.config.ts` and focused test run — current validation infrastructure.

### Secondary

None required. This phase uses only existing project capabilities and locked decisions; no new package or external protocol was researched.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies and primitives are installed and used in current code.
- Architecture: HIGH — derived from current schema/repository boundaries and locked phase decisions.
- Promotion canonical semantics: MEDIUM-HIGH — plan writes are explicit; creative demotion and exact dimension wording remain the two stated assumptions.
- Pitfalls: HIGH — each is tied to a concrete current-code gap.

**Research date:** 2026-06-28  
**Valid until:** 2026-07-28, or until Phase 203-205 artifact schemas/repositories change.
