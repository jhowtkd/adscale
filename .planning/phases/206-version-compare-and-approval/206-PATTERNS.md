# Phase 206: Version Compare and Approval - Pattern Map

**Mapped:** 2026-06-28  
**Files analyzed:** 23 likely new/modified files  
**Primary analogs:** 6 code paths reused across the file set

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/src/lib/assistant/artifact-version.ts` | model / DTO schema | transform | same file, existing strict version/presentation schemas | exact extension |
| `app/src/server/db/schema.ts` | model | CRUD | same file, `assistantArtifactLineages` / `Versions` / `Heads` / `Proposals` | exact extension |
| `app/drizzle/0067_assistant_artifact_approvals.sql` (name/number may follow generated migration) | migration | CRUD | `app/drizzle/0064_assistant_artifact_versions.sql` | exact family |
| `app/src/server/repositories/artifact-version.ts` | repository | transactional CRUD / CAS | same file, scoped reads + `updateArtifactHead` | exact extension |
| `app/src/server/assistant/artifact-version/comparison.ts` | service / presenter | request-response transform | `app/src/server/assistant/artifact-version/service.ts` | role + domain match |
| `app/src/server/assistant/artifact-version/promotion.ts` | service | request-response / transactional command | `app/src/server/assistant/artifact-version/service.ts` delegating to repository | role match |
| `app/src/server/assistant/plan-iteration/diff.ts` | utility | transform | same file, `buildPlanSemanticChanges` | exact extension, algorithm changes |
| `app/src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.ts` | route / controller | request-response | sibling `artifact-versions/route.ts` | exact family |
| `app/src/app/api/assistant/threads/[threadId]/artifact-versions/comparison-acknowledgements/route.ts` | route / controller | request-response | sibling `artifact-versions/route.ts` | exact family |
| `app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.ts` | route / controller | request-response | sibling `artifact-versions/route.ts` | exact family |
| `app/src/lib/hooks/use-assistant-artifact-versions.ts` | hook | request-response / cache invalidation | `app/src/lib/hooks/use-assistant-threads.ts` | role match |
| `app/src/lib/hooks/use-assistant-threads.ts` | hook / model mapper | transform | same file, nested thread response mapping | exact extension |
| `app/src/components/assistant/VersionHistory.tsx` | component | event-driven / read-only presentation | `app/src/components/assistant/AssistantContextPanel.tsx` | role match |
| `app/src/components/assistant/VersionComparisonDialog.tsx` | component | event-driven / request-response | `app/src/components/ui/dialog.tsx` plus existing dialog compositions | component match |
| `app/src/components/assistant/AssistantContextPanel.tsx` | component | event-driven presentation | same file, ordered context sections | exact integration |
| `app/src/components/assistant/AssistantActionCard.tsx` | component | event-driven presentation | same file, payload-derived secondary actions | exact integration |
| `app/src/server/assistant/artifact-version/comparison.test.ts` | test | transform / request-response | `service.test.ts` and `plan-iteration/diff.test.ts` | domain match |
| `app/src/server/assistant/artifact-version/promotion.test.ts` | test | transactional CRUD / conflicts | `artifact-version.test.ts` | domain match |
| `app/src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.test.ts` | test | request-response | sibling `artifact-versions/route.test.ts` | exact family |
| `app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.test.ts` | test | request-response / conflict | sibling `artifact-versions/route.test.ts` | exact family |
| `app/src/components/assistant/VersionHistory.test.tsx` | test | event-driven UI | `AssistantActionCard.test.tsx` | role match |
| `app/src/components/assistant/VersionComparisonDialog.test.tsx` | test | event-driven UI | `AssistantActionCard.test.tsx` | role match |
| `app/src/lib/hooks/use-assistant-threads.test.tsx` | test | transform / query | same file | exact extension |

## Pattern Assignments

### Contracts and sanitized comparison DTOs

**Apply to:** `app/src/lib/assistant/artifact-version.ts`, comparison/promotion services, hooks, and their tests.  
**Analog:** `app/src/lib/assistant/artifact-version.ts`

Use strict Zod objects, discriminated unions for plan versus creative, bounded user text, and inferred exported types. Persisted snapshots may retain internal fields; comparison response schemas must be separate safe view models so `outputKey`, derivation/provider details, prompts, and UUID provenance do not leak into the primary UI.

**Schema pattern** (lines 15-41):

```ts
export const planVersionSnapshotSchema = z
  .object({
    type: z.literal("plan"),
    strategy: boundedText.nullable(),
    angles: boundedTextList,
    hooks: boundedTextList,
    ctas: boundedTextList,
    constraints: boundedText.nullable(),
  })
  .strict();

export const artifactVersionSnapshotSchema = z.discriminatedUnion("type", [
  planVersionSnapshotSchema,
  creativeVersionSnapshotSchema,
]);
```

**Presentation pattern** (lines 126-146):

```ts
export const artifactVersionPresentationSchema = z
  .object({
    lineageId: z.string().uuid(),
    artifactType: artifactTypeSchema,
    approvedCurrent: artifactVersionSummarySchema.nullable(),
    working: artifactVersionSummarySchema.nullable(),
    versions: z.array(artifactVersionSummarySchema),
    pendingProposals: z.array(artifactProposalSummarySchema),
    generationStatus: z.object({
      status: z.string().trim().min(1).max(50),
      safeError: z.string().max(500).nullable(),
    }).strict().nullable(),
  })
  .strict();
```

The comparison DTO should expose version label/status/date/feedback, semantic diff or safe creative metadata, and response-only `previewUrl`. Promotion input/output should carry explicit expected revision(s), target IDs, acknowledgement ID when compound, effect preview, and refreshed safe state on conflict.

---

### Persistence, scope, immutable history, and atomic promotion

**Apply to:** `schema.ts`, migration, `repositories/artifact-version.ts`, promotion service, and repository/service tests.  
**Analog:** `app/src/server/repositories/artifact-version.ts`

Every query must use the existing four-dimensional scope. Do not weaken it to workspace-only or trust scope IDs from the client.

**Scope guard and predicates** (lines 23-28, 49-65, 104-126):

```ts
export interface ArtifactScope {
  workspaceId: string;
  clientProfileId: string;
  campaignId: string;
  threadId: string;
}

export function assertArtifactScope(scope: ArtifactScope, row: Partial<ArtifactScope>) {
  if (row.workspaceId !== scope.workspaceId) throw new ArtifactVersionValidationError("Cross-workspace access rejected");
  if (row.clientProfileId !== scope.clientProfileId) throw new ArtifactVersionValidationError("Cross-client access rejected");
  if (row.campaignId !== scope.campaignId) throw new ArtifactVersionValidationError("Cross-campaign access rejected");
  if (row.threadId !== scope.threadId) throw new ArtifactVersionValidationError("Cross-thread access rejected");
}

const versionScope = (scope: ArtifactScope) =>
  and(
    eq(assistantArtifactVersions.workspaceId, scope.workspaceId),
    eq(assistantArtifactVersions.clientProfileId, scope.clientProfileId),
    eq(assistantArtifactVersions.campaignId, scope.campaignId),
    eq(assistantArtifactVersions.threadId, scope.threadId)
  );
```

Promotion belongs in one `db.transaction`, not sequential calls to `updateArtifactHead`, `updatePlanStatus`, and `updateDerivationStatus`. Re-read lineage, head, target versions, canonical records, and acknowledgement inside the transaction; then CAS both heads for compound promotion, update canonical plan/campaign/derivation rows, stale affected pending proposals, and append approval event(s). Any failed eligibility or zero-row CAS throws and rolls everything back.

**Transaction shape** (lines 233-271):

```ts
return db.transaction(async (tx) => {
  const [lineage] = await tx.insert(assistantArtifactLineages).values({ ... }).returning();
  const [version] = await tx.insert(assistantArtifactVersions).values({ ... }).returning();
  const [head] = await tx.insert(assistantArtifactLineageHeads).values({ ... }).returning();
  return { lineage: lineage!, version: version!, head: head! };
});
```

**CAS pattern** (lines 337-360):

```ts
const [updated] = await db
  .update(assistantArtifactLineageHeads)
  .set({
    approvedCurrentVersionId: input.approvedCurrentVersionId,
    workingVersionId: input.workingVersionId,
    revision: input.expectedRevision + 1,
    updatedAt: new Date(),
  })
  .where(and(
    eq(assistantArtifactLineageHeads.lineageId, input.lineageId),
    eq(assistantArtifactLineageHeads.revision, input.expectedRevision)
  ))
  .returning();
if (!updated) {
  throw new ArtifactHeadConflictError("Artifact head revision conflict", await getArtifactHead(input.scope, input.lineageId));
}
```

Extend the Phase 203 table family with two narrow append-only/scoped concepts:

- approval events: operation ID, artifact type, lineage, promoted version, previous official version, full scope, timestamp;
- linked-plan comparison acknowledgements: full scope, creative target, plan lineage, linked plan version, compared official plan version, compared head revision, timestamp.

Follow the current schema family’s FKs, scope index, lineage/time index, and generated UUID/date defaults (`schema.ts` lines 2322-2377 and 2435-2457). Follow migration `0064_assistant_artifact_versions.sql` for `IF NOT EXISTS`, explicit FKs, and named indexes. Immutable version rows remain untouched.

Canonical sync is intentionally split today: plan fields are in `creativePlans` (`schema.ts` lines 549-573), constraints are in `campaigns` (line 409), and creative status/output are in `derivations` (lines 601-665). The transaction must update those exact rows scoped by workspace/campaign; no new canonical table or abstraction is needed.

---

### Comparison and promotion domain services

**Apply to:** `comparison.ts`, `promotion.ts`, and their tests.  
**Analog:** `app/src/server/assistant/artifact-version/service.ts`

Keep thread scope derivation server-owned and reuse repository reads. The service assembles presentation DTOs and does not expose database rows directly.

**Thread scope derivation** (lines 38-53):

```ts
async function resolveThreadScope(workspaceId: string, threadId: string): Promise<ArtifactScope> {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) throw new ArtifactVersionValidationError("Thread not found");
  if (!thread.campaignId) {
    throw new ArtifactVersionValidationError("Thread is not linked to a campaign");
  }
  return {
    workspaceId,
    clientProfileId: thread.clientProfileId,
    campaignId: thread.campaignId,
    threadId,
  };
}
```

**Parallel read + parse + pointer resolution** (lines 160-224):

```ts
const [versions, head, proposals] = await Promise.all([
  listArtifactVersions(scope, lineageId),
  getArtifactHead(scope, lineageId),
  listArtifactProposals(scope, lineageId),
]);
const versionSummaries = versions.map((version) =>
  artifactVersionSummarySchema.parse({ ...version })
);
const byId = new Map(versionSummaries.map((version) => [version.id, version]));

return {
  lineageId: lineage.id,
  artifactType: lineage.artifactType as ArtifactType,
  approvedCurrent: head?.approvedCurrentVersionId
    ? byId.get(head.approvedCurrentVersionId) ?? null
    : null,
  working: head?.workingVersionId
    ? byId.get(head.workingVersionId) ?? null
    : null,
  versions: versionSummaries,
  pendingProposals: proposalSummaries,
  generationStatus,
};
```

Comparison must require two distinct version IDs, load both through scoped repository methods, and assert one lineage. Plan comparison returns server-computed canonical-order diff. Creative comparison resolves `getPresignedDownloadUrl(outputKey)` only while presenting the response and derives dimensions with `getTargetDimensions`; preview failure should produce a safe nullable/error presentation without rejecting all metadata.

Promotion service should only validate/prepare effect preview and call the repository transaction. Eligibility is a closed allowlist (`ready` plus previously approved evidence), never a “not failed” test. Compound creative promotion requires an acknowledgement matching the creative target, linked plan version, current plan version, plan lineage, scope, and current plan revision.

---

### Order-aware semantic plan comparison

**Apply to:** `app/src/server/assistant/plan-iteration/diff.ts`, `comparison.ts`, and comparator tests.  
**Analog:** the same diff module, but replace its order-insensitive normalization.

Preserve the established canonical order and pure-function shape:

```ts
// app/src/server/assistant/plan-iteration/diff.ts:6-15,44-53
const PLAN_FIELDS = ["strategy", "angles", "hooks", "ctas", "constraints"] as const;

export function buildPlanSemanticChanges(before: PlanVersionSnapshot, after: PlanVersionSnapshot) {
  return PLAN_FIELDS.filter((field) => fieldChanged(field, before, after)).map(
    (field) => ({ field, description: describeChange(field) })
  );
}
```

The current `normalizeList(...).sort()` at lines 23-25 deliberately erases moves and cannot be copied. Trim/filter while retaining indexes; produce explicit add/remove/edit/move/unchanged entries with before/after values and indices. Use the smallest deterministic occurrence-aware matcher (bounded lists make a local LCS implementation sufficient); do not add a diff dependency or generic diff framework.

---

### Authenticated comparison/promotion routes

**Apply to:** compare, acknowledgement, and promote routes plus route tests.  
**Analog:** `app/src/app/api/assistant/threads/[threadId]/artifact-versions/route.ts`

Use strict route-local Zod bodies, derive workspace and thread from auth/params in parallel, verify the thread, and map known domain errors before the shared handler.

**Auth and scope pattern** (lines 23-33):

```ts
async function scopedRequest(request: Request, params: Promise<{ threadId: string }>) {
  const [{ workspace }, { threadId }] = await Promise.all([
    requireWorkspaceAccess(request),
    params,
  ]);
  const thread = await getAssistantThreadById(workspace.id, threadId);
  return { workspace, threadId, thread };
}
```

**Validation and response pattern** (lines 53-69):

```ts
const { workspace, threadId, thread } = await scopedRequest(request, params);
if (!thread) return apiError("threadNotFound", 404);
const parsed = bodySchema.safeParse(await request.json());
if (!parsed.success) {
  return apiError("invalidInput", 400, parsed.error.flatten());
}
return NextResponse.json(await command({ workspaceId: workspace.id, threadId, ...parsed.data }));
```

**Conflict response pattern** (lines 71-83):

```ts
if (error instanceof ArtifactHeadConflictError) {
  return NextResponse.json(
    { error: "revisionConflict", message: error.message, head: error.head },
    { status: 409 }
  );
}
if (error instanceof ArtifactVersionValidationError) {
  return apiError("invalidInput", 400, { message: error.message });
}
return handleApiError(error, "assistant.threads.artifact-versions.POST");
```

For Phase 206, the 409 body should additionally contain refreshed sanitized lineage/comparison state and old/new official labels. It must not retry. The compare GET/POST is read-only; acknowledgement creation is the only comparison-side persistence. Promotion returns no billing/credit operation because it must not call billing at all.

---

### Query mapping and cache invalidation

**Apply to:** `use-assistant-threads.ts`, new `use-assistant-artifact-versions.ts`, and hook tests.  
**Analog:** `app/src/lib/hooks/use-assistant-threads.ts`

Fix the known response gap first: `AssistantThreadDetail` currently contains only thread/messages/guided fields (lines 31-36), while `fetchAssistantThread` maps only those fields (lines 77-98). Add typed `artifactVersionState` and recursively coerce version/proposal/acknowledgement timestamps to `Date`.

Reuse query-key and mutation invalidation conventions:

```ts
// app/src/lib/hooks/use-assistant-threads.ts:126-128,166-185,188-195
export function assistantThreadQueryKey(threadId: string) {
  return ["assistant", "thread", threadId] as const;
}

export function useAssistantThread(threadId: string | null) {
  return useQuery({
    queryKey: threadId ? assistantThreadQueryKey(threadId) : ["assistant", "thread", "disabled"],
    queryFn: () => fetchAssistantThread(threadId!),
    enabled: !!threadId,
    staleTime: STALE_TIME.DYNAMIC,
  });
}

const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ["assistant", "thread", threadId] });
```

Comparison selection, zoom, pan, modal state, and confirmation state stay local React state. Do not add a store. Promotion success/conflict invalidates the thread/version keys; conflict state remains visible and requires a new explicit mutation.

---

### Persistent history and chat shortcuts

**Apply to:** `VersionHistory.tsx`, `AssistantContextPanel.tsx`, `AssistantActionCard.tsx`, and component tests.  
**Analog:** `app/src/components/assistant/AssistantContextPanel.tsx`

The context panel already consumes one thread query and orders independent sections in one scroll container. Insert `VersionHistory` after readiness/review and before job status, passing typed `artifactVersionState`; do not fetch the same state again inside each timeline row.

**Panel integration pattern** (lines 25-37, 76-89, 141-143):

```tsx
const { data, isLoading } = useAssistantThread(threadId, { pollWhileActive: true });

return (
  <div className="flex h-full flex-col gap-6 overflow-y-auto p-4 pt-12">
    {/* readiness */}
    <AssistantReviewPanel threadId={threadId} />
    {/* VersionHistory belongs here */}
    <section data-testid="context-job-status">...</section>
  </div>
);
```

Follow the existing compact section/list treatment at lines 116-139 and 143-182: semantic `<section>`, heading, native buttons, `mt-2 space-y-2`, tokenized colors/borders, and explicit empty state. Newest-first ordering already comes from repository `orderBy(desc(versionNumber))` (`artifact-version.ts` lines 183-201).

`AssistantActionCard` should add secondary history/compare buttons only when the completed version-producing payload exposes the needed lineage/version reference. Reuse its existing derived payload state and button group pattern (`AssistantActionCard.tsx` lines 84-95 and 312-331); do not infer IDs from visible copy or expose actions for unrelated cards.

---

### Wide comparison workspace and confirmation

**Apply to:** `VersionComparisonDialog.tsx` and its tests.  
**Analog:** `app/src/components/ui/dialog.tsx` with composition precedent from `RegenerateFeedbackDialog.tsx`.

Reuse the Base UI-backed primitive; it already supplies portal, backdrop, focus trap, close restoration, reduced-motion behavior, header/body/footer, and a single modal system.

**Primitive composition** (`dialog.tsx` lines 76-112, 115-163):

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="...phase-specific wide/full-viewport sizing...">
    <DialogHeader>...</DialogHeader>
    <DialogBody className="flex-1 overflow-y-auto">...</DialogBody>
    <DialogFooter>...</DialogFooter>
  </DialogContent>
</Dialog>
```

The primitive’s current max size is `xl: sm:max-w-4xl` (lines 63-68), so the comparison component should override width/height responsively with classes as the UI spec requires rather than add another modal library. Mobile comparison must override the primitive’s normal bottom-sheet geometry to full viewport. Use `showCloseButton={false}` if the phase-specific Portuguese close control is rendered in the sticky header.

**Pending confirmation pattern** (`RegenerateFeedbackDialog.tsx` lines 145-156, 171-184):

```tsx
<DialogFooter>
  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
    Voltar à comparação
  </Button>
  <Button type="button" disabled={isSubmitting} onClick={onConfirm}>
    {isSubmitting ? "Atualizando versão oficial…" : confirmLabel}
  </Button>
</DialogFooter>
```

Unlike generic `ConfirmDialog`, promotion must not close in `finally`: a 409 keeps both workspace and confirmation context open. Use default, not destructive, button styling. Disable dismissal while pending and set `aria-busy`. On conflict, render a persistent `role="alert"`, focus its heading, clear confirmation/acknowledgement state, and never auto-mutate.

Plan rendering is two-column/stacked semantic blocks from the server DTO. Creative viewing needs only local normalized `{ zoom, x, y }` shared by both `object-contain` stages, native pointer/wheel/keyboard handlers, and existing buttons/icons. No image viewer or diff package is needed. Preserve each failed preview’s stage and metadata, with a retry that refetches comparison data.

## Shared Patterns

### Authentication and authorization

**Source:** sibling artifact-version route, lines 23-33.  
**Apply to:** all three new routes.  
Always call `requireWorkspaceAccess`, load thread by workspace, derive client/campaign/thread scope server-side, and use scoped repository queries for every lineage/version/acknowledgement ID.

### Input and persistence safety

**Source:** `artifact-version.ts` schemas and repository lines 67-88, 228-231, 283-286.  
**Apply to:** DTOs, comparison, acknowledgement, promotion.  
Strict Zod parsing plus `assertSafeArtifactJson`; signed URLs are response-only. No prompt/provider/generation-log data enters a comparison response or new JSON persistence.

### Error handling

**Source:** artifact-version route lines 70-83.  
**Apply to:** all routes and mutation hook.  
Known validation errors map to 400, lineage/ownership/revision conflicts to typed 409, unknown errors to `handleApiError`. Conflict responses carry refreshed safe state and are never retried automatically.

### Atomicity and history

**Source:** artifact repository lines 233-271 and 315-363.  
**Apply to:** promotion only.  
One transaction owns every head/canonical/proposal/history write. Immutable snapshots are never edited or deleted. Approval events are inserted in the same transaction that changes the official pointer.

### Testing

Use existing Vitest splits and adjacent test styles. Minimum assertions are: strict DTO sanitization and same-lineage/distinct pair validation; list move/add/remove/edit order; all promotion status/scope/revision checks; rollback after each compound-operation failure point; no billing call; signed URL never persisted; route auth/error/409 body; thread nested-date mapping; timeline labels/selection; preview failure; pending-dismiss lock; conflict alert/focus/no retry.

## No Exact Analog Found

| File / Concern | Reason | Planner Direction |
|---|---|---|
| Order-aware plan diff with explicit moves | Existing comparator sorts lists and intentionally hides moves. | Extend the bounded pure comparator; no package/general engine. |
| Approval-event and linked-plan acknowledgement tables | Phase 203 stores only current pointers/proposals. | Extend the same scoped table/migration family with append-only narrow rows. |
| Atomic creative + exact-plan promotion | Current canonical update helpers are independent. | Implement one transaction in `artifact-version` repository; do not compose existing helpers sequentially. |
| Synchronized image zoom/pan | No existing comparison viewer was found. | Local normalized React state + native pointer/wheel/keyboard events; no dependency. |
| Full-width comparison workspace | Dialog primitive tops out at `xl`; no existing wide compare modal. | Compose/override existing `DialogContent`, preserving its focus/portal behavior. |

## Metadata

**Analog search scope:** `app/src/lib/assistant`, `app/src/server/assistant`, `app/src/server/repositories`, `app/src/server/db`, `app/src/app/api/assistant`, `app/src/components/assistant`, `app/src/components/ui`, `app/drizzle`  
**Primary analogs read:** `artifact-version.ts` contract, repository, service, sibling route, `AssistantContextPanel.tsx`, dialog primitive/composition  
**Pattern extraction date:** 2026-06-28
