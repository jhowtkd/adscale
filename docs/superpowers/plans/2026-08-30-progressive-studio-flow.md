# Progressive Studio Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace the visually overloaded Studio entry with a progressive, explicit flow—free text/art entry, objective selection, prepared-plan review, explicit confirmation, generation, and versioned refinement—while keeping every durable operation on the existing Creative Work aggregate.

**Architecture:** Put one temporary, server-assigned `control | progressive` presentation branch around the existing `DashboardHomeActions` / `useCreativeComposer` path. The controller keeps an internal fallback protocol for type compatibility, but the progressive variant does not create a draft, upload, autosave, or show a selected objective until the user chooses one. A pure `PreparedPlanProjectionV1` is reconstructed from the canonical `inputSnapshot`; `preparePlan()` and `confirmGeneration()` become separate commands, with `updatedAt` used as the existing CAS token. Campaigns, curated inspirations, outputs, revisions, retry, billing, refund, and polling continue to use their current repositories and endpoints. The existing beta-analytics table holds Studio interaction and canonical funnel events; no schema change is needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query, Zod, Drizzle/PostgreSQL, Radix-based existing Dialog/Sheet primitives, Vitest/Testing Library, Playwright, existing Inngest controlled-provider path, existing beta analytics and billing ledger.

**Spec:** `docs/superpowers/specs/2026-08-30-progressive-studio-flow-design.md`

## Scope Contract

- **Outcome:** One understandable Studio journey from free entry through explicit objective, editable prepared plan, explicit generation confirmation, focused results, refinement, and version recovery on the existing Creative Work.
- **Non-goals:** No intent router, generic protocol engine, new persistence, pricing change, external inspiration feed, broad campaign redesign, or permanent dual experience.
- **Files:** Only the existing Studio/controller, Creative Work prepare/generate/detail paths, current analytics surface, affected copy/tests, one pure prepared-plan projector, one temporary rollout helper, and one rollout runbook listed task-by-task below.
- **Proof:** Focused red/green tests per task, lint/typecheck, controlled-provider functional E2E with real isolated test storage/Inngest, frozen control baseline, 10-person comprehension gate, staged metrics, and final removal of the control branch.

## Global Constraints

- Keep `creative_work` as the only durable creative aggregate. Do not add a router, generic protocol engine, draft table, prepared-plan column, version table, comparison endpoint, campaign endpoint, event table, or feature-flag framework.
- Add no dependency and no migration. Use Node `crypto`, `sessionStorage`, the existing `Dialog`/`Sheet`, TanStack Query, and current repositories.
- Never show a per-operation credit amount anywhere inside the Studio flow, including the control branch, plan, confirmation, generation, result, retry, or final state. Keep the global balance, internal quote, settlement, debit, compensation, refund, and insufficient-credit block unchanged.
- Never make Enter confirm a paid generation. Only the explicit `Confirmar e gerar` button may call `confirmGeneration()`.
- `preparePlan()` may analyze and persist the prepared snapshot, but it must not reserve or debit credits, create outputs, dispatch Inngest, or call the image provider.
- `generation_confirmed` is recorded only after `startGenerationSettlement()` returns success. `studio_plan_confirmed` is recorded only after the same server response reaches the client. Credit block, stale revision, dispatch failure, or uncertain response must not advance either event.
- Store the 24-hour Studio UUID only in `properties.studioSessionId`; never send it in beta analytics' `sessionId`, which is a foreign key to owner-run beta sessions.
- Preserve old `intent`, `mode`, `workId`, template, campaign, Quick Tool, and resume links. A plain new `/` entry must not silently reopen a protocol draft; the existing resume strip is the explicit way back.
- Preserve all existing source, identity, billing, idempotency, retry, and refund rules. A ready legacy work may resume, but generation must never auto-prepare a draft after this change.
- During rollout, the control and progressive presentations must call the same controller, hooks, applications, repositories, and settlement. The only temporary duplication is render order and the control branch's one-click wrapper.
- Default `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT` to `0`. Do not raise it, deploy, publish, provision secrets, or run a live/paid provider as part of implementation without the release gates below.
- Automated generation uses only the existing localhost-controlled provider. Any live provider run or paid retry remains a separate explicit approval.
- Preserve unrelated work. Stage only the files named by the active task; never use `git add .`, `git add -A`, reset, clean, or broad restore.
- Run `graphify update .` after source changes and before each source commit, as required by the repository instructions. Do not stage unrelated graph changes.

## Execution Map

```text
Task 1 experiment/session foundation
  └─ Task 2 deterministic prepared-plan contract
       └─ Task 3 public prepare/detail contract
            └─ Task 4 CAS confirmation + accepted-generation telemetry
                 └─ Task 5 split controller + instrument control
                      ├─ Baseline Gate A (rollout remains 0%)
                      └─ Task 6 free entry + explicit objective
                           └─ Task 7 progressive plan UI
                                ├─ Task 8 campaign + references
                                └─ Task 9 results + versions
                                     └─ Task 10 vocabulary/docs
                                          └─ Task 11 rollout analytics/runbook
                                               └─ Task 12 functional CI gate
                                                    └─ Human Gate B
                                                         └─ 10% → 50% → 100%
                                                              └─ Task 13 remove control branch
```

Tasks 1–5 establish a measurable control without exposing the progressive variant. Tasks 6–12 may be built and verified locally while the baseline accumulates, but the external rollout must stay at zero until Baseline Gate A passes.

---

## Task 1: Add the Studio session and deterministic rollout foundation

**Files:**

- Create: `app/src/lib/beta-analytics/studio-session.ts`
- Create: `app/src/lib/beta-analytics/studio-session.test.ts`
- Create: `app/src/server/studio-rollout.ts`
- Create: `app/src/server/studio-rollout.test.ts`
- Modify: `app/src/lib/beta-analytics/constants.ts`
- Modify: `app/src/lib/hooks/use-record-beta-event.ts`
- Modify: `app/src/lib/hooks/use-record-beta-event.test.ts`
- Modify: `app/src/server/beta-analytics/types.ts`
- Modify: `app/src/server/beta-analytics/types.test.ts`
- Modify: `app/src/server/beta-analytics/sanitize.test.ts`
- Modify: `app/src/server/beta-analytics/record.test.ts`
- Modify: `app/src/server/validation/env.ts`
- Modify: `app/src/server/validation/env.test.ts`
- Modify: `app/src/app/(dashboard)/page.tsx`
- Modify: `app/src/app/(dashboard)/page.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/.env.example`
- Modify: `docs/CONFIGURATION.md`

**Public contracts:**

```ts
export const STUDIO_SESSION_STORAGE_KEY = "adscale:studio-session:v1";
export const STUDIO_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type StudioSession = {
  id: string;
  workspaceId: string;
  expiresAt: number;
};

export type StudioRolloutVariant = "control" | "progressive";

export function getOrCreateStudioSession(
  workspaceId: string,
  now?: number,
  storage?: Pick<Storage, "getItem" | "setItem">,
): StudioSession;
```

```ts
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";

export function studioRolloutBucket(workspaceId: string): number;
export function resolveStudioRolloutVariant(
  workspaceId: string,
  percent: number,
): StudioRolloutVariant;
```

Use the native Node hash only:

```ts
import { createHash } from "node:crypto";

export function studioRolloutBucket(workspaceId: string): number {
  const prefix = createHash("sha256").update(workspaceId).digest("hex").slice(0, 8);
  return Number.parseInt(prefix, 16) % 100;
}

export function resolveStudioRolloutVariant(workspaceId: string, percent: number) {
  const bounded = Math.max(0, Math.min(100, Math.trunc(percent)));
  return studioRolloutBucket(workspaceId) < bounded ? "progressive" : "control";
}
```

**Steps:**

- [ ] Add failing session tests covering: same workspace before expiry reuses the UUID; a workspace change rotates it; expiry rotates it; corrupt JSON rotates it; every stored value is `{id, workspaceId, expiresAt}` and the id parses as UUID.
- [ ] Add failing rollout tests covering exact 0%/100% boundaries, a stable bucket for the same workspace, and different deterministic buckets for a fixed list of workspace UUIDs.
- [ ] Run:

```bash
cd app
npm test -- \
  src/lib/beta-analytics/studio-session.test.ts \
  src/server/studio-rollout.test.ts
```

Expected failure: both new modules are missing.

- [ ] Implement `getOrCreateStudioSession()` with `crypto.randomUUID()`. Treat missing storage, malformed JSON, a different workspace, a non-UUID id, or `expiresAt <= now` as rotation. Do not use cookies or local storage.
- [ ] Add `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT` to `envSchema` as `z.coerce.number().int().min(0).max(100).default(0)`. Add `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=0` to `.env.example` and document it as a temporary server-only percentage.
- [ ] Extend beta analytics with exactly these UI-only event keys:

```ts
export const STUDIO_BETA_EVENT_KEYS = [
  "studio_entry_started",
  "studio_goal_selected",
  "studio_source_role_selected",
  "studio_plan_shown",
  "studio_plan_changed",
  "studio_plan_confirmed",
  "studio_refinement_started",
] as const;
```

- [ ] Include `CREATIVE_WORK_FUNNEL_EVENTS` in `BETA_EVENT_KEYS` so the already-approved canonical names can be persisted through the existing recorder. Extend `ALLOWED_PROPERTY_KEYS` only with `studioSessionId`, `creativeWorkId`, `inputMode`, `protocol`, `sourceRole`, `rolloutVariant`, and `outputCount`; `format` is already allowed.
- [ ] Generalize the existing hook without duplicating its fetch path:

```ts
export function useRecordBetaEvent(
  campaignId?: string | null,
  options: { includeBetaSession?: boolean } = {},
)
```

When `includeBetaSession === false`, omit the request body's `sessionId`. Omit `campaignId` when absent. Include a stable JSON serialization of properties in the five-second dedupe key so two different protocol or source-role choices are not collapsed.
- [ ] Extend `use-record-beta-event.test.ts` to assert that a Studio event sends `properties.studioSessionId` and no top-level `sessionId`; existing campaign callers must keep their current owner-session behavior.
- [ ] Extend `record.test.ts` to iterate the Studio and canonical Creative Work event lists. Assert a Studio event with `studioSessionId` is inserted without calling `getBetaSessionById()`, while a real top-level `sessionId` still performs the existing owner-session foreign-key validation.
- [ ] Make `DashboardPage` call `requireWorkspaceAccess()` with no request, calculate the variant from `env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`, and pass `workspaceId` plus `rolloutVariant` to `DashboardHomeActions`. Keep all existing parsed search parameters.
- [ ] Add one component test proving `DashboardHomeActions` receives `control` at zero and does not change the current visual branch yet. This task creates no progressive UI.
- [ ] Run the focused suite; expect pass:

```bash
cd app
npm test -- \
  src/lib/beta-analytics/studio-session.test.ts \
  src/lib/hooks/use-record-beta-event.test.ts \
  src/server/studio-rollout.test.ts \
  src/server/beta-analytics/types.test.ts \
  src/server/beta-analytics/sanitize.test.ts \
  src/server/beta-analytics/record.test.ts \
  src/server/validation/env.test.ts \
  'src/app/(dashboard)/page.test.tsx' \
  src/components/dashboard/DashboardHomeActions.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit only Task 1 files:

```bash
git add \
  app/src/lib/beta-analytics/constants.ts \
  app/src/lib/beta-analytics/studio-session.ts \
  app/src/lib/beta-analytics/studio-session.test.ts \
  app/src/lib/hooks/use-record-beta-event.ts \
  app/src/lib/hooks/use-record-beta-event.test.ts \
  app/src/server/studio-rollout.ts \
  app/src/server/studio-rollout.test.ts \
  app/src/server/beta-analytics/types.ts \
  app/src/server/beta-analytics/types.test.ts \
  app/src/server/beta-analytics/sanitize.test.ts \
  app/src/server/beta-analytics/record.test.ts \
  app/src/server/validation/env.ts \
  app/src/server/validation/env.test.ts \
  'app/src/app/(dashboard)/page.tsx' \
  'app/src/app/(dashboard)/page.test.tsx' \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/.env.example \
  docs/CONFIGURATION.md
git commit -m "feat: add studio experiment foundation"
```

---

## Task 2: Define the deterministic prepared plan and enforce the material matrix

**Files:**

- Create: `app/src/server/creative-work/prepared-plan.ts`
- Create: `app/src/server/creative-work/prepared-plan.test.ts`
- Modify: `app/src/server/application/prepare-creative-work.ts`
- Modify: `app/src/server/application/prepare-creative-work.test.ts`

**Exact projection contract:**

```ts
export type PreparedPlanProjectionV1 = {
  version: 1;
  workId: string;
  preparedRevision: string;
  protocol: "variations" | "single" | "format_adaptation" | "restyle";
  materials: Array<{
    sourceId: string;
    label: string;
    role: "content" | "style" | "both" | "piece_reference" | "original_art";
    category: string | null;
    treatment:
      | "identity_preservation"
      | "recognizable_preservation"
      | "exact_application"
      | "required_presence"
      | "visual_language"
      | "style_direction"
      | null;
  }>;
  preserve: Array<
    | "verified_facts"
    | "brand_requirements"
    | "source_content"
    | "source_visual_identity"
    | "piece_reference_identity"
    | "piece_reference_recognizability"
    | "piece_reference_exact_application"
    | "piece_reference_required_presence"
  >;
  explore: Array<
    | "composition"
    | "hierarchy"
    | "visual_language"
    | "format_layout"
    | "new_execution"
    | "piece_reference_visual_language"
    | "piece_reference_style_direction"
  >;
  outputs: Array<{
    label: string;
    targetFormat: "1:1" | "4:5" | "9:16";
    directionId: string | null;
  }>;
  outputCount: number;
  formats: Array<"1:1" | "4:5" | "9:16">;
};

export function projectPreparedPlanV1(work: {
  id: string;
  toolKind: CreativeWorkIntent;
  format: CreativeWorkFormat;
  inputSnapshot: CreativeWorkInputSnapshot | null;
  updatedAt: Date;
}): PreparedPlanProjectionV1 | null;
```

**Projection rules:**

- Return `null` for missing snapshots, `social_post`, an invalid/missing fact pack, or a snapshot whose sources cannot satisfy its protocol.
- Set `preparedRevision` to `work.updatedAt.toISOString()` and use only `inputSnapshot.settings`, frozen sources, and `quoteCreativeWork()`.
- Never copy request text, analyses, fact values, raw snapshot fields, prompt material, or credits into the projection.
- Preserve source order. Deduplicate `preserve`, `explore`, and `formats` while retaining first occurrence.
- For Single, map each frozen `pieceReference.treatment` exactly to the corresponding approved key. Do not infer identity preservation from mere presence.
- For Variations, map frozen source `usage` to `content`, `style`, or `both`; use direction snapshot labels when present and the existing level labels otherwise.
- For Format Adaptation, expose one `original_art` material and label outputs by target format.
- For Restyle, expose content as `original_art`, style as `style`, and label the output `Novo estilo`.

**Steps:**

- [ ] Add a failing table-driven unit test with one valid fixture per protocol and one legacy fixture. Assert exact object equality, exact array order, exact output labels, `preparedRevision`, no `credits` property, and the six Single treatment mappings.
- [ ] Run:

```bash
cd app
npm test -- src/server/creative-work/prepared-plan.test.ts
```

Expected failure: the new module is missing.

- [ ] Implement the pure projector with `quoteCreativeWork()` and existing piece-reference types. Do not import a repository or call the database.
- [ ] Add failing application tests for the approved live material contract:

```text
single             non-empty request; 0..3 ready categorized references
variations         at least one ready base art; explicit content/style/both
format_adaptation  exactly one ready art
restyle            exactly two distinct ready sources; one content and one style; no both
```

The tests must assert invalid cases return before copy generation, billing, output creation, or image dispatch.
- [ ] Replace Restyle's `resolveEffectiveSources()` inference with the persisted `source.usage`. Update `detectCreativeWorkDraftBrandConflict()` to use the same explicit roles, so preparation and conflict resolution cannot disagree.
- [ ] Keep the existing Single three-reference limit, category confidence rule, transparent exact-logo rule, and visual-only fact authority. Strengthen only the protocol/cardinality checks listed above.
- [ ] Return `preparedPlan` from every successful preparation branch, including the canonical-snapshot reuse branches. Project from the row actually returned by the CAS update; do not project the stale pre-update aggregate.
- [ ] Run:

```bash
cd app
npm test -- \
  src/server/creative-work/prepared-plan.test.ts \
  src/server/application/prepare-creative-work.test.ts
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/server/creative-work/prepared-plan.ts \
  app/src/server/creative-work/prepared-plan.test.ts \
  app/src/server/application/prepare-creative-work.ts \
  app/src/server/application/prepare-creative-work.test.ts
git commit -m "feat: prepare deterministic studio plans"
```

---

## Task 3: Expose the safe prepared-plan contract and preserve it in the client cache

**Files:**

- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/lib/hooks/use-creative-work.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.test.tsx`

**Client additions:**

```ts
export interface CreativeWorkDetail {
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
  sources: CreativeWorkSource[];
  preparedPlan: PreparedPlanProjectionV1 | null;
  // existing fields stay unchanged
}
```

```ts
export function usePrepareCreativeWork() {
  // existing timeout remains 120_000 ms
  return useMutation({
    mutationFn: (input: { workItemId: string }) =>
      patchJson<{
        work: CreativeWorkItem;
        quote: CreativeWorkQuote;
        preparedPlan: PreparedPlanProjectionV1;
        // existing optional briefing fields
      }>(`/api/creative-work/${input.workItemId}`, { action: "prepare" }, 120_000),
  });
}
```

**Steps:**

- [ ] Extend the route GET test with a prepared work whose `inputSnapshot` contains a fact pack and frozen sources. Assert `body.preparedPlan` is exact, `body.work.inputSnapshot` is absent, outputs still contain every ancestor, and the existing inferred briefing/fact-pack public projections remain intact.
- [ ] Extend the prepare PATCH test to assert the application-returned `preparedPlan` reaches the response unchanged.
- [ ] Run:

```bash
cd app
npm test -- 'src/app/api/creative-work/[id]/route.test.ts'
```

Expected failure: GET has no `preparedPlan` and currently spreads the raw `inputSnapshot` into `work`.

- [ ] In GET, reconstruct `preparedPlan` with `projectPreparedPlanV1(result.work)`. Destructure `inputSnapshot` out of the public work response instead of creating a new DTO framework:

```ts
const { inputSnapshot: _inputSnapshot, ...publicWork } = result.work;

return NextResponse.json({
  work: { ...publicWork, request: displayRequestForCreativeWork(result.work) },
  preparedPlan: projectPreparedPlanV1(result.work),
  // existing outputs, sources, briefing, layer editor and canonical fields
});
```

- [ ] Add `preparedPlan` to `CreativeWorkDetail`, `mapCreativeWorkDetail()`, `fetchCreativeWork()`, and the prepare mutation response. Preserve it in both existing `queryClient.setQueryData<CreativeWorkDetail>()` branches (`useGenerateCopy` and `useTriggerTriplet`) rather than accidentally dropping it.
- [ ] Add hook tests proving GET maps dates without changing the plan and cache writes preserve the current plan until invalidation/refetch replaces it.
- [ ] Run:

```bash
cd app
npm test -- \
  'src/app/api/creative-work/[id]/route.test.ts' \
  src/lib/hooks/use-creative-work.test.ts \
  src/lib/hooks/use-creative-work.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  'app/src/app/api/creative-work/[id]/route.ts' \
  'app/src/app/api/creative-work/[id]/route.test.ts' \
  app/src/lib/hooks/use-creative-work.ts \
  app/src/lib/hooks/use-creative-work.test.ts \
  app/src/lib/hooks/use-creative-work.test.tsx
git commit -m "feat: expose safe prepared studio plans"
```

---

## Task 4: Require prepared-revision confirmation under the existing lock

**Files:**

- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/server/repositories/creative-work.test.ts`
- Modify: `app/src/server/application/generate-creative-work.ts`
- Modify: `app/src/server/application/generate-creative-work.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/lib/hooks/use-creative-work.test.tsx`

**Strict initial-generation command:**

```ts
const initialGenerationSchema = z.object({
  action: z.literal("initial"),
  preparedRevision: z.string().datetime({ offset: true }),
  studioSessionId: z.string().uuid().optional(),
  rolloutVariant: z.enum(["control", "progressive"]).optional(),
}).strict();
```

```ts
export async function generateCreativeWork(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  preparedRevision: string;
  studioSessionId?: string;
  rolloutVariant?: "control" | "progressive";
}): Promise<GenerateCreativeWorkResult>;
```

**Repository change:**

```ts
export async function confirmCreativeWorkSnapshotsIfUnchanged(
  workspaceId: string,
  workItemId: string,
  expectedUpdatedAt: Date,
  inputSnapshot: CreativeWorkInputSnapshot,
  identitySnapshot: CreativeWorkIdentitySnapshot,
  executor: Pick<typeof db, "update"> = db,
): Promise<CreativeWorkItem | null>;
```

**Steps:**

- [ ] Add failing repository/application/route tests for: missing revision rejected at HTTP 400; a stale revision returns `stale_input`/409; a valid draft is confirmed under `withCreativeWorkPreparationLock`; no prepare call occurs inside generation; credit block creates no output/job and preserves ready work; ready + zero outputs resumes; existing outputs replay without another charge or dispatch; dispatch failure does not record acceptance.
- [ ] Add the optional executor to `confirmCreativeWorkSnapshotsIfUnchanged()` and assert the transaction executor is used.
- [ ] Remove the import and call of `prepareCreativeWork()` from `generateCreativeWork()`. For a draft, require `brief`, `copy`, and `inputSnapshot`, parse `preparedRevision`, compare it with `updatedAt`, build identity, then call the existing confirmation CAS inside `withCreativeWorkPreparationLock()`.
- [ ] Keep the existing all-or-nothing legacy snapshot backfill only for already-`ready` historical work. Never use it to prepare a draft.
- [ ] Check revision/CAS only while the work is a draft. A ready work after credit block and a replay with outputs remain idempotently resumable.
- [ ] Call `startGenerationSettlement()` unchanged. Only after it returns `{ok: true}`, fire-and-forget the canonical event through `recordBetaAnalyticsEvent()`:

```ts
void recordBetaAnalyticsEvent({
  workspaceId: input.workspaceId,
  userId: input.userId,
  eventKey: "generation_confirmed",
  source: "server",
  properties: {
    creativeWorkId: input.workItemId,
    protocol: work.toolKind,
    outputCount: settled.value.outputs.length,
    ...(input.studioSessionId ? { studioSessionId: input.studioSessionId } : {}),
    ...(input.rolloutVariant ? { rolloutVariant: input.rolloutVariant } : {}),
  },
}).catch((error) => logger.warn("[creative-work] generation_confirmed telemetry failed", error));
```

Analytics failure must not change the accepted generation response.
- [ ] Change `useTriggerTriplet()` to accept and post:

```ts
{
  workItemId: string;
  preparedRevision: string;
  studioSessionId?: string;
  rolloutVariant?: StudioRolloutVariant;
}
```

- [ ] Preserve revision commands on the same endpoint unchanged.
- [ ] Run:

```bash
cd app
npm test -- \
  src/server/repositories/creative-work.test.ts \
  src/server/application/generate-creative-work.test.ts \
  'src/app/api/creative-work/[id]/generate/route.test.ts' \
  src/lib/hooks/use-creative-work.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/server/repositories/creative-work.ts \
  app/src/server/repositories/creative-work.test.ts \
  app/src/server/application/generate-creative-work.ts \
  app/src/server/application/generate-creative-work.test.ts \
  'app/src/app/api/creative-work/[id]/generate/route.ts' \
  'app/src/app/api/creative-work/[id]/generate/route.test.ts' \
  app/src/lib/hooks/use-creative-work.ts \
  app/src/lib/hooks/use-creative-work.test.tsx
git commit -m "feat: confirm prepared studio revisions"
```

---

## Task 5: Split the controller commands, remove action-level credit copy, and instrument the control

**Files:**

- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/server/jobs/creative-work.ts`
- Modify: `app/src/server/jobs/creative-work.test.ts`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Controller contract introduced in this task:**

```ts
export type ComposerStage =
  | "entry"
  | "configure"
  | "plan"
  | "generation"
  | "results";

useCreativeComposer({
  initialWorkId,
  initialIntent,
  workspaceId,
  workflowVariant,
  studioSessionId,
  focusComposer,
  initialTemplateId,
  freshEntry,
});
```

Add these return values without removing the current control-facing fields yet:

```ts
stage: ComposerStage;
objectiveSelected: boolean; // true throughout the temporary control branch
preparedPlan: PreparedPlanProjectionV1 | null;
preparePlan(): Promise<PreparedPlanProjectionV1 | null>;
confirmGeneration(preparedRevision?: string): Promise<void>;
generateLegacy(): Promise<void>;
```

`generateLegacy()` is temporary and exists only so the control renders exactly one action while calling the new commands in order. The progressive branch must never call it.

**Canonical stage projection:**

```ts
function projectComposerStage(input: {
  objectiveSelected: boolean;
  detail: CreativeWorkDetail | null;
}): ComposerStage {
  if (!input.objectiveSelected) return "entry";
  if (!input.detail) return "configure";
  if (input.detail.work.status === "draft") {
    return input.detail.preparedPlan ? "plan" : "configure";
  }
  if (input.detail.work.status === "ready" && input.detail.outputs.length === 0) {
    return "plan";
  }
  if (
    input.detail.work.status === "generating"
    || input.detail.outputs.some((output) =>
      output.status === "queued" || output.status === "processing")
  ) {
    return "generation";
  }
  return "results";
}
```

Any completed or failed terminal output keeps the surface in `results`; a partial failure never sends the person back to configuration.

**Steps:**

- [ ] Add failing controller tests proving: `preparePlan()` flushes autosave and calls prepare but never generation; `confirmGeneration()` posts the current `preparedRevision`; a stale or missing plan does not call generation; `generateLegacy()` performs exactly one prepare followed by one generation; ready + zero outputs skips prepare and remains resumable; an uncertain response blocks a second confirmation until GET reconciliation establishes whether outputs exist.
- [ ] Run:

```bash
cd app
npm test -- src/components/creative-work/useCreativeComposer.test.tsx
```

Expected failure: preparation and generation are still coupled in `generate()`.

- [ ] Extract the save-and-prepare portion of `generate()` into `preparePlan()`. It returns the response projection, updates the detail cache/state through the existing hook behavior, and stops at `stage === "plan"`.
- [ ] Extract the accepted-generation portion into `confirmGeneration(preparedRevision)`. It sends `{workItemId, preparedRevision, studioSessionId, rolloutVariant}`, keeps the existing double-submit guard, and preserves the current uncertain-response reconciliation. Enter and textarea submit handlers must never call it.
- [ ] Implement `generateLegacy()` as the temporary composition of those two functions. For a ready work with zero outputs, use the reconstructed GET plan and call confirmation directly. Remove the old monolithic `generate` return field.
- [ ] After a brand-authority conflict is resolved, rerun only `preparePlan()` in the progressive branch so the corrected plan is shown; call `generateLegacy()` only in the control branch.
- [ ] Pass `workspaceId`, `workflowVariant`, and the Task 1 Studio session from `DashboardHomeActions` into the controller. Keep the control markup and ordering otherwise unchanged.
- [ ] Record UI-only events through `useRecordBetaEvent(undefined, {includeBetaSession: false})`. Every event includes `{studioSessionId, rolloutVariant}` and, once available, `creativeWorkId`:

```text
studio_entry_started       first Studio mount in the 24-hour session
studio_goal_selected       visible control default, then each explicit protocol choice
studio_source_role_selected after a successful mutation changes the persisted role
studio_refinement_started  after a revision request is accepted
```

- [ ] Record canonical client-observable events once per work in a `Set` ref: `creative_work_started` after `ensureDraft()` succeeds, `briefing_ready` after prepare succeeds, `creative_work_reopened` after an `initialWorkId` hydrates, `creative_work_reviewed` when a terminal result first becomes visible, and `creative_work_approved` after approval succeeds. Put `inputMode: "text" | "art" | "both"` on `creative_work_started`, derived only from the actual request/source state. Do not emit `generation_confirmed` from the client.
- [ ] In `creative-work.ts`, record `output_ready` after `completeCreativeWorkOutput()` wins its CAS. In the existing `finally`, after `refreshCreativeWorkStatus()`, record `creative_work_failed` only when the refreshed aggregate is terminal `failed`. Include `creativeWorkId`, `protocol`, and `outputCount`; omit Studio session data because the aggregator will join these server events to the accepted generation by `creativeWorkId`. Skip the event when `createdByUserId` is absent. Analytics errors only log warnings and never change output, ledger, retry, or refund state.
- [ ] Extend job tests so a winning completion records `output_ready`, a discarded late completion does not, and an all-failed aggregate records `creative_work_failed`. Assert telemetry rejection cannot convert a completed output to failed or refund it.
- [ ] Remove `quote.credits` from the control CTA now. Keep output count, but translate it as `Gerar 3 variações` / `Generate 3 variations`; Restyle remains `Gerar novo estilo`. Add a component assertion that the Studio region contains neither `crédito` nor `credit` while the controller quote still retains its internal value.
- [ ] Run:

```bash
cd app
npm test -- \
  src/components/creative-work/useCreativeComposer.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/server/jobs/creative-work.test.ts
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  app/src/components/creative-work/CreativeComposer.tsx \
  app/src/components/creative-work/CreativeComposer.test.tsx \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/src/server/jobs/creative-work.ts \
  app/src/server/jobs/creative-work.test.ts \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "refactor: split studio prepare and confirmation"
```

---

## Baseline Gate A: Measure the instrumented control before external rollout

This gate authorizes measurement, not progressive traffic.

- [ ] Keep `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=0` in every external environment.
- [ ] Obtain explicit deployment approval, deploy Tasks 1–5, and verify that the owner analytics ingest receives control `studio_entry_started`, `creative_work_started`, `briefing_ready`, `generation_confirmed`, and `output_ready` events without a `beta_sessions` foreign-key error.
- [ ] Collect at least 14 complete days and 30 eligible Studio sessions. If 14 days produces fewer than 30 sessions, continue collecting until the denominator is reached.
- [ ] After Task 11 supplies the report, freeze the exact date range and values for completion, abandonment, failure, refund, goal switches, role corrections, refinement, resume, and median entry-to-briefing time in the rollout runbook.
- [ ] Do not raise rollout above zero until the baseline is frozen, Task 12 passes, and Human Gate B is approved.

Tasks 6–12 can be implemented and tested locally while data accumulates; this gate blocks only external progressive traffic.

---

## Task 6: Add progressive free entry, one-file buffering, and explicit objective selection

**Files:**

- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/src/app/(dashboard)/dashboard-search-params.ts`
- Modify: `app/src/app/(dashboard)/page.test.tsx`

**Progressive additions:**

```ts
objective: ComposerIntent | null;
objectiveSelected: boolean;
bufferedFile: File | null;
hasEntry: boolean;
canContinue: boolean;
canConfirm: boolean;
clearBufferedFile(): void;
selectIntent(intent: ComposerIntent): Promise<void>;
```

Keep `intentRef.current = "variations"` as an internal compatibility fallback only. In a plain progressive `/` entry, `objective` is `null`, no card is pressed, and that fallback causes no persistence or upload.

**Steps:**

- [ ] Add failing tests for text-only, file-only, and text + file entry. Before objective selection, assert no draft mutation, autosave mutation, upload request, stored-draft read, or `workId` URL parameter occurs.
- [ ] Add tests proving multiple dropped files retain only the first `File`, announce that the remaining files can be added after objective selection, and keep the buffered file after a failed upload so the user can retry or remove it.
- [ ] Add tests for each explicit initial objective. Selecting the current internal fallback (`variations`) must still count as the first explicit choice; it must preserve the local request, start durable creation, upload the buffered file, attach it once, clear it only after success, and expose the resulting `workId`.
- [ ] Add a template-link regression: when a valid `templateId` arrives without explicit `intent`/legacy `mode`, hold it as pending entry context, reveal objectives, and attach it only after the person chooses one. When the URL already contains an explicit legacy protocol, keep the current immediate materialization. In both cases consume `templateId` only after a successful attachment.
- [ ] Add protocol-switch regression tests proving a later objective change still saves the current draft, opens or creates the other protocol draft, preserves the protocol-switch notice, and never converts the current row.
- [ ] Run the red tests:

```bash
cd app
npm test -- \
  src/components/creative-work/useCreativeComposer.test.tsx \
  'src/app/(dashboard)/page.test.tsx'
```

Expected failure: the controller still restores/creates a default Variations draft and uploads before an explicit objective.

- [ ] Change `parseDashboardSearchParams()` to return `initialIntent?: ComposerIntent`. Explicit legacy `intent` wins; legacy `mode=briefing` maps to `single`; `mode=arte` maps to `variations`; a plain root has no initial intent. Keep UUID validation for `workId` and `templateId`.
- [ ] In the progressive variant, do not call `readStoredDraft()` on a plain root. An explicit `workId`, legacy protocol URL, template, Quick Tool, or resume link continues to hydrate the canonical work. The control branch keeps its current restore behavior until Task 13.
- [ ] Guard `ensureDraft`, the 500 ms autosave, `persistOnUnmountRef`, and upload behind `objectiveSelected` only for the progressive branch. The control remains behaviorally unchanged.
- [ ] Make the first `selectIntent()` path distinct from `switchToProtocol()`: set the explicit objective and protocol defaults without clearing the buffered request. Then create the draft from text, or upload the buffered file and create it with the returned asset. Existing later switches continue through `switchToProtocol()`.
- [ ] Make every caller await `selectIntent()`. In particular, `addInspiration()` must await the Restyle switch before attaching its style source, eliminating the current protocol-switch race.
- [ ] Derive `hasEntry` from local request, buffered file, pending template, or persisted sources; derive `canContinue` from the existing protocol-specific readiness rules; derive `canConfirm` from a current plan and idle reconciliation state. Do not persist another state machine.
- [ ] Run:

```bash
cd app
npm test -- \
  src/components/creative-work/useCreativeComposer.test.tsx \
  'src/app/(dashboard)/page.test.tsx'
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  'app/src/app/(dashboard)/dashboard-search-params.ts' \
  'app/src/app/(dashboard)/page.test.tsx'
git commit -m "feat: add explicit studio entry objective"
```

---

## Task 7: Render the progressive hierarchy and editable plan review

**Files:**

- Create: `app/src/components/creative-work/CreativePlanReview.tsx`
- Create: `app/src/components/creative-work/CreativePlanReview.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/src/components/creative-work/CreativeToolCards.tsx`
- Modify: `app/src/components/creative-work/CreativeToolCards.test.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Plan component props:**

```ts
export type CreativePlanReviewProps = {
  plan: PreparedPlanProjectionV1;
  busy: boolean;
  onEdit: () => void;
  onConfirm: (preparedRevision: string) => void | Promise<void>;
};
```

**Steps:**

- [ ] Add a failing `DashboardHomeActions` test showing the progressive branch in this semantic order: header/brand, compact resume strip, free-entry composer, objective choices only after input, protocol-specific configuration, and secondary actions. Assert `Com arte`, `Com briefing`, and the permanent inspiration grid do not render.
- [ ] Keep the resume strip non-blocking and derive one next-action label from data it already loads: `Revisar plano` when `preparedPlan` exists; otherwise `Continuar configuração` for `intending`/`briefing`, `Acompanhar geração` for `generating`, or `Revisar peças` for `reviewing`. Preserve preview, work name, brand, state, and canonical `resumeHref`; do not add another resume resolver.
- [ ] Add failing `CreativeToolCards` tests for `selected: ComposerIntent | null`, real buttons, `aria-pressed`, two-column mobile/list fallback, four compact choices, and focus on the newly revealed configuration after selection.
- [ ] Add failing `CreativePlanReview` tests for exact human sections: Objetivo, Materiais, Preservar, Explorar, Formato, Quantidade, and Ajustes. Assert every `preserve`/`explore` key has PT-BR and EN copy, Piece Reference text includes the source label, and neither raw keys nor credit values render.
- [ ] Run the red component slice:

```bash
cd app
npm test -- \
  src/components/creative-work/CreativeToolCards.test.tsx \
  src/components/creative-work/CreativePlanReview.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/dashboard/DashboardHomeActions.test.tsx
```

Expected failure: `CreativePlanReview` is absent and the current dashboard still renders both mode selectors and all decisions at once.

- [ ] Implement the progressive common entry block with the prompt `O que você quer criar?`, one textarea, one drop target, and one `Adicionar arte ou referência` button. Keep the current accessible file input as the non-drag alternative.
- [ ] Keep entry/configuration/plan in one centered `max-w-4xl` reading column and let results expand to the existing `max-w-6xl` grid. Reuse current spacing, radius, border, selection, and focus tokens; add no parallel design system.
- [ ] Render objectives only after `composer.hasEntry`. Selecting an incompatible objective must reveal its missing slot and explanation; do not hide or disable the option.
- [ ] Keep objective cards compact (`grid-cols-2` where space permits, `lg:grid-cols-4`) and allow only one page-level primary action per stage: `Continuar` in configuration or `Confirmar e gerar` in plan review. Put `Ajustes opcionais` in a native collapsed `<details>`.
- [ ] Reuse the protocol-specific controls already in `CreativeComposer`:

```text
Peça única         pedido + PieceReferenceStrip (0..3 categorized references)
Variações          ready base art + CreativeSourceChip content/style/both + directions
Adaptar formatos   one fixed Arte original + target formats; no usage selector
Mudar estilo       distinct Arte original/content and Referência de estilo/style slots
```

Do not add a universal material-role abstraction. Stop using the simplified variations source chip so its existing explicit role buttons remain visible.
- [ ] The progressive configuration CTA is `Continuar` and calls only `preparePlan()`. When it resolves, focus the plan heading and record `studio_plan_shown` once for that `preparedRevision`.
- [ ] `CreativePlanReview` translates deterministic keys and renders `Revisar ajustes` plus `Confirmar e gerar`. `Revisar ajustes` returns to configuration without mutating anything. `Confirmar e gerar` passes the rendered `preparedRevision`; only a click on that button invokes confirmation.
- [ ] Render the existing insufficient-balance error at the plan boundary as `Créditos insuficientes` plus the existing `Obter créditos` action. Assert it creates no outputs/request and leaves the plan visible; no numeric cost appears.
- [ ] After any request, source, role, direction, format, or briefing edit invalidates the server plan, return to configuration and record `studio_plan_changed` once for the old revision. Do not keep a locally stale plan visible.
- [ ] When a later objective switch would leave the current draft, show the existing confirmation surface with the exact message `Este objetivo começa outro rascunho. O trabalho atual continuará salvo.` before calling `switchToProtocol()`.
- [ ] After generation is accepted, record `studio_plan_confirmed`, focus the generation/results heading, and render the configuration plus plan inside a native collapsed `<details>` named `Plano usado`. Keep it keyboard-operable and available to screen readers.
- [ ] At `generation` and `results`, place a compact header above `Plano usado`, derived from the current detail: work name, brand, and human operational state. Do not persist a second title or status.
- [ ] Preserve the control branch behind `workflowVariant === "control"`, using `generateLegacy()`. Remove operation-cost text from both branches. Do not duplicate controller or business calls in the render branches.
- [ ] Add keyboard tests that Enter in the request textarea and plan area creates zero generate requests; Space/Enter on the focused `Confirmar e gerar` button creates one. Add mobile tests at 390 px asserting no horizontal overflow and a single-column plan/results layout.
- [ ] Run:

```bash
cd app
npm test -- \
  src/components/creative-work/CreativeToolCards.test.tsx \
  src/components/creative-work/CreativePlanReview.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/CreativeSourceChip.test.tsx \
  src/components/creative-work/CreativeSourcePreviewCard.test.tsx \
  src/components/creative-work/PieceReferenceStrip.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/components/creative-work/CreativePlanReview.tsx \
  app/src/components/creative-work/CreativePlanReview.test.tsx \
  app/src/components/creative-work/CreativeComposer.tsx \
  app/src/components/creative-work/CreativeComposer.test.tsx \
  app/src/components/creative-work/CreativeToolCards.tsx \
  app/src/components/creative-work/CreativeToolCards.test.tsx \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "feat: render progressive studio plan flow"
```

---

## Task 8: Make campaign creation secondary and inspirations intentional

**Files:**

- Modify: `app/src/app/(dashboard)/dashboard-search-params.ts`
- Modify: `app/src/app/(dashboard)/page.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/src/components/creative-work/BrandInspirations.tsx`
- Modify: `app/src/components/creative-work/BrandInspirations.test.tsx`
- Modify: `app/src/components/creative-work/BrandInspirations.integration.test.tsx`
- Modify: `app/src/lib/hooks/use-campaigns.ts`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Steps:**

- [ ] Add a validated optional `campaignId` UUID to `parseDashboardSearchParams()` and controller input. Invalid, array, and cross-syntax values are omitted; old parameters remain unchanged.
- [ ] Add failing dashboard tests for a secondary-outline `Nova campanha` button opening an existing `Dialog` with only required name, read-only active brand, Cancel, and Create. Assert no product, audience, platform, format, objective, or briefing fields appear.
- [ ] Reuse `useCreateCampaign()` with this exact payload:

```ts
{
  name: campaignName.trim(),
  client: activeProfile.name,
  clientProfileId: activeProfile.id,
}
```

Keep the dialog open with the typed name and inline error on POST failure. Do not create or mutate a Creative Work in that path.
- [ ] Change `composer.linkCampaign()` to return `Promise<boolean>`. With a current work it calls the existing `linkCampaign` mutation; without a work it stores the validated id in controller state and the URL. After `ensureDraft()` creates the first work, link that pending id exactly once. A link failure keeps the work unchanged, keeps the pending id available for retry, and returns `false` so the dialog stays open.
- [ ] Remove only the `campaignId` search parameter after a successful canonical link, preserving `workId`, explicit legacy intent, and any still-valid template parameter. Cancel or failure leaves the current URL/context unchanged.
- [ ] Because campaign linking advances the work's existing `updatedAt` CAS token, await the current detail invalidation/refetch before closing a dialog opened from plan review. If a plan was already visible, render the reconstructed plan/revision from GET; never confirm with the pre-link revision. Cover this with a controller test.
- [ ] Extend `useCreateCampaign()` success invalidation with `["creative-work", "campaign-options"]`; do not change the campaign endpoint or draft schema.
- [ ] Add failing inspiration tests proving the page shows only an `Adicionar referência` trigger until activated. The existing `Sheet` must list `useCreativeInspirations()` results in server order, show curated origin, and perform no external fetch or client shuffle.
- [ ] Within each inspiration item, make the image a preview-only button opening the existing `Dialog`. Add a separate `Usar para mudar estilo` CTA. Assert image click never changes objective or attaches a source.
- [ ] Run the red interaction slice:

```bash
cd app
npm test -- \
  'src/app/(dashboard)/page.test.tsx' \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  src/components/creative-work/BrandInspirations.test.tsx \
  src/components/creative-work/BrandInspirations.integration.test.tsx
```

Expected failure: campaign creation is still a link and inspirations still render a shuffled permanent grid whose image click attaches immediately.

- [ ] Make the CTA await `selectIntent("restyle")`, attach the curated item as `style`, close the sheet, then focus `#creative-composer-original-source` after the Sheet's trigger-focus restoration completes. Give the original-art slot that stable id and preserve keyboard focus on close/cancel.
- [ ] Run:

```bash
cd app
npm test -- \
  'src/app/(dashboard)/page.test.tsx' \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  src/components/creative-work/BrandInspirations.test.tsx \
  src/components/creative-work/BrandInspirations.integration.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  'app/src/app/(dashboard)/dashboard-search-params.ts' \
  'app/src/app/(dashboard)/page.test.tsx' \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  app/src/components/creative-work/BrandInspirations.tsx \
  app/src/components/creative-work/BrandInspirations.test.tsx \
  app/src/components/creative-work/BrandInspirations.integration.test.tsx \
  app/src/lib/hooks/use-campaigns.ts \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "feat: add focused studio campaign and references"
```

---

## Task 9: Focus partial results and expose existing version ancestry

**Files:**

- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx`
- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx`
- Modify: `app/src/components/creative-work/CreativeResultCard.tsx`
- Modify: `app/src/components/creative-work/CreativeResultCard.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Private lineage helper:**

```ts
function outputLineage(
  outputs: readonly CreativeWorkOutput[],
  current: CreativeWorkOutput,
): CreativeWorkOutput[] {
  const byId = new Map(outputs.map((output) => [output.id, output]));
  const visited = new Set<string>();
  const lineage: CreativeWorkOutput[] = [];
  let cursor: CreativeWorkOutput | undefined = current;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    lineage.push(cursor);
    cursor = cursor.parentOutputId ? byId.get(cursor.parentOutputId) : undefined;
  }
  return lineage;
}
```

Keep it private and test it through visible behavior. Missing parents and cycles terminate safely; no new utility module is warranted.

**Steps:**

- [ ] Add failing grid tests with two independent branches whose version numbers overlap. Assert the existing direction/format grouping still chooses the latest row per branch and never mixes ancestry by `versionNumber` alone.
- [ ] Add failing result tests for count-based progress, failed-output-only retry, `Refinar`, version history fields, a two-image comparison, focus transfer, and cycle/missing-parent safety.
- [ ] Run the red result slice:

```bash
cd app
npm test -- \
  src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx \
  src/components/creative-work/CreativeResultCard.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx
```

Expected failure: the current result grid has no progress summary, ancestry sheet, or two-version comparison.

- [ ] Add a progress region whose text is derived only from output status counts: `2 de 3 prontas`, followed by per-output ready/generating/failed state. Set `aria-live="polite"`; its text changes only when the count/status tuple changes, not on each polling render.
- [ ] Keep completed cards usable while siblings are queued, processing, or failed. Show `Tentar novamente` only on the failed output and preserve the existing output-specific retry mutation.
- [ ] Rename the visible action `Editar` to `Refinar`; keep the existing inline instruction, optional attachment, and revision command. A new revision remains unselected and never replaces or deletes its ancestor.
- [ ] Show `Versões (n)` only when `outputLineage()` has more than one row. Open an existing `Sheet` listing thumbnail, version number, creation date, and `revisionInstruction` for current + ancestors.
- [ ] Show `Comparar` only inside a multi-version lineage. The existing `Dialog` must render exactly two labeled images: current and one selected ancestor. Do not add a pixel diff, slider, endpoint, query, or persistence.
- [ ] When stage first changes to `generation` or `results`, focus the results heading. Keep `Plano usado` collapsed above progress and grid; optional campaign association remains below the grid.
- [ ] Add assertions that reload uses all ancestors already returned by GET, the grid still renders only the latest per lineage, and the history sheet reopens the prior version without another network request.
- [ ] Run:

```bash
cd app
npm test -- \
  src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx \
  src/components/creative-work/CreativeResultCard.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx \
  app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx \
  app/src/components/creative-work/CreativeResultCard.tsx \
  app/src/components/creative-work/CreativeResultCard.test.tsx \
  app/src/components/creative-work/CreativeComposer.tsx \
  app/src/components/creative-work/CreativeComposer.test.tsx \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "feat: add focused results and version comparison"
```

---

## Task 10: Align product vocabulary and document the no-cost-copy exception

**Files:**

- Modify: `CONTEXT.md`
- Modify: `.planning/REQUIREMENTS.md`
- Modify: `.planning/PROJECT.md`
- Modify: `app/src/components/layout/TopBar.tsx`
- Modify: `app/src/components/layout/TopBar.test.tsx`
- Modify: `app/tests/unit/i18n/product-narrative-copy.test.ts`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Steps:**

- [ ] Add failing copy tests that require the root navigation label and `aria-label` to be `Estúdio` / `Studio`, reject `Início` / `Home` as the visible root name, and require both locale trees to expose the same progressive Studio keys.
- [ ] Run the red copy slice:

```bash
cd app
npm test -- \
  src/components/layout/TopBar.test.tsx \
  tests/unit/i18n/product-narrative-copy.test.ts
```

Expected failure: the root accessible label and canonical glossary still use `Início` / `Home`.

- [ ] Rename the canonical glossary entry `Início` to `Estúdio`: `Superfície operacional para começar ou retomar um Trabalho`. Keep `Visão geral` distinct and list `Início` and `Dashboard` under terms to avoid as visible names.
- [ ] Do not rewrite completed milestone history. Under current `CREV-02`, add the explicit rule that initial generation in Studio exposes intended change, format, references, preserve/explore, and output count, while operation credit impact remains internal. Existing non-Studio version-proposal disclosure remains unchanged.
- [ ] In `.planning/PROJECT.md`, register the owner decision: no per-operation credit amount anywhere in Studio; global balance, insufficient-credit block, ledger, debit, compensation, and refund remain authoritative.
- [ ] Replace obsolete dual-mode and action-cost translation keys with the progressive entry, plan, campaign, reference, progress, version, and recovery copy already exercised by component tests. Keep credit language outside the Studio namespace intact.
- [ ] Update `TopBar` and its route-label tests so `/` resolves to `Estúdio` / `Studio`, including the logo's accessible label.
- [ ] Run the focused tests and explicit absence checks:

```bash
cd app
npm test -- \
  src/components/layout/TopBar.test.tsx \
  tests/unit/i18n/product-narrative-copy.test.ts \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/creative-work/CreativePlanReview.test.tsx
! rg -n 'quote\.credits|credits:' src/components/creative-work/CreativeComposer.tsx
! rg -n '"generate"\s*:\s*"[^"]*(crédit|credit)' messages/pt-BR.json messages/en.json
npm run typecheck
```

The negative `rg` checks must exit 0 through `!`, meaning no Studio action-cost copy remains.

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  CONTEXT.md \
  .planning/REQUIREMENTS.md \
  .planning/PROJECT.md \
  app/src/components/layout/TopBar.tsx \
  app/src/components/layout/TopBar.test.tsx \
  app/tests/unit/i18n/product-narrative-copy.test.ts \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "docs: align progressive studio vocabulary"
```

---

## Task 11: Aggregate rollout metrics in the existing owner analytics surface

**Files:**

- Modify: `app/src/server/beta-analytics/aggregate.ts`
- Modify: `app/src/server/beta-analytics/aggregate.fixture.ts`
- Modify: `app/src/server/beta-analytics/aggregate.test.ts`
- Modify: `app/src/server/repositories/usage.ts`
- Modify: `app/src/app/api/feedback/analytics/funnel/route.ts`
- Modify: `app/src/app/api/feedback/analytics/funnel/route.test.ts`
- Modify: `app/src/components/feedback/OwnerAnalyticsPanel.tsx`
- Modify: `app/src/components/feedback/OwnerAnalyticsPanel.test.tsx`
- Create: `docs/runbooks/progressive-studio-rollout.md`

**Pure aggregate contract:**

```ts
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";

export type StudioFunnelArm = {
  variant: StudioRolloutVariant;
  eligibleSessions: number;
  confirmedGenerations: number;
  completionsWithin24h: number;
  completionRate: number | null;
  abandonmentsBeforeGeneration: number;
  abandonmentRate: number | null;
  goalSwitches: number;
  sourceRoleCorrections: number;
  successfulResumesWithin30m: number;
  refinementsStarted: number;
  debitedGenerations: number;
  compensatedGenerations: number;
  failedGenerations: number;
  failureRate: number | null;
  refundedGenerations: number;
  refundRate: number | null;
  medianEntryToBriefingMs: number | null;
  medianEntryToPlanMs: number | null;
  completionByInputMode: Array<{
    inputMode: "text" | "art" | "both" | "unknown";
    eligibleSessions: number;
    completionsWithin24h: number;
    completionRate: number | null;
  }>;
};

export type StudioUsageEvent = {
  workspaceId: string;
  amount: number | null;
  metadata: unknown;
  createdAt: Date;
};

export function aggregateStudioFunnel(
  events: BetaAnalyticsEvent[],
  usageEvents: StudioUsageEvent[],
): StudioFunnelArm[];
```

**Aggregation rules:**

- A session is the first valid `studio_entry_started` for `{workspaceId, properties.studioSessionId}`. Its 24-hour window begins at that timestamp.
- Freeze the arm from that first entry's `rolloutVariant`; ignore later arm changes caused by a raised percentage.
- Deduplicate accepted generations by `{session, creativeWorkId}`. Join server `output_ready` / `creative_work_failed` events to the session through the work's accepted `generation_confirmed`.
- Completion is at least one `output_ready` for that work within 24 hours. Abandonment is no `generation_confirmed` within 24 hours.
- A goal switch is the second `studio_goal_selected` after the session already has `creative_work_started`. A role correction is one successfully recorded `studio_source_role_selected`; the controller emits it only when the persisted role actually changes. The approved allowlist intentionally stores no source id or asset data.
- A successful resume is `creative_work_reopened` followed by the next canonical stage event for that work within 30 minutes.
- A refund is a usage row with `amount < 0`, `metadata.refund === true`, and matching `metadata.creativeWorkId`. Failure/refund denominators are confirmed generations, not outputs.
- A debited generation has at least one positive matching usage row. A compensated generation has a matching refund with `metadata.description === "creative_work_dispatch_refund"`. Count generations, never ledger rows, so multi-output work does not inflate either value.
- Attribute `completionByInputMode` from the work's first `creative_work_started.inputMode`; sessions that abandon before a work exists remain `unknown` rather than being inferred.
- Median entry-to-plan is progressive-only diagnostic data. Never compare the control's absent plan event as zero.

**Steps:**

- [ ] Extend the fixture with two workspaces, both variants, duplicate mounts, duplicated generation responses, a cross-midnight 24-hour completion, abandonment, resume at 29/31 minutes, partial output failure, all-output failure, one debit, one dispatch compensation, and one terminal refund. Add exact-equality tests for every field above and for arm attribution frozen from the first entry.
- [ ] Run the red analytics slice:

```bash
cd app
npm test -- \
  src/server/beta-analytics/aggregate.test.ts \
  src/app/api/feedback/analytics/funnel/route.test.ts \
  src/components/feedback/OwnerAnalyticsPanel.test.tsx
```

Expected failure: `studioFunnel`, the usage join, and the owner comparison section do not exist.

- [ ] Implement `aggregateStudioFunnel()` in the existing aggregate module with maps/sets and a small private median helper. Do not add an analytics framework or persisted rollup.
- [ ] Add `listUsageEventsForOwner({workspaceId?, from?, to?})` to `usage.ts`, using the same owner route's validated filters and an inclusive date range. Return only usage rows needed for the report; authorization stays in the route.
- [ ] In the owner-only funnel route, fetch events, beta sessions, and usage rows in the same cached callback. Pass usage to `buildAnalyticsFunnelSummary()` and return `studioFunnel` alongside existing reports. Route tests must prove non-owner 403, filters forwarded to both repositories, and no usage metadata is returned raw.
- [ ] Add one compact `Estúdio progressivo` section to `OwnerAnalyticsPanel`: control/progressive columns, denominators, rates, medians, deltas in percentage points, sample sufficiency, and red gate labels when thresholds fail. Do not expose event payloads or financial amounts.
- [ ] Write the runbook with: exact query date ranges; baseline-freeze record; 10/50/100 stage checklist; denominator definitions; comparison thresholds; immediate rollback criteria; how to set only `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`; and an evidence table for owner, timestamp, environment, deployed commit, metrics, incidents, and decision.
- [ ] Run:

```bash
cd app
npm test -- \
  src/server/beta-analytics/aggregate.test.ts \
  src/app/api/feedback/analytics/funnel/route.test.ts \
  src/components/feedback/OwnerAnalyticsPanel.test.tsx
npm run typecheck
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/server/beta-analytics/aggregate.ts \
  app/src/server/beta-analytics/aggregate.fixture.ts \
  app/src/server/beta-analytics/aggregate.test.ts \
  app/src/server/repositories/usage.ts \
  app/src/app/api/feedback/analytics/funnel/route.ts \
  app/src/app/api/feedback/analytics/funnel/route.test.ts \
  app/src/components/feedback/OwnerAnalyticsPanel.tsx \
  app/src/components/feedback/OwnerAnalyticsPanel.test.tsx \
  docs/runbooks/progressive-studio-rollout.md
git commit -m "feat: report progressive studio rollout metrics"
```

---

## Task 12: Put the functional progressive journey in CI with the controlled provider

**Infrastructure checkpoint — stop here if unmet:**

The repository owner must first provision and confirm a dedicated, isolated S3/R2-compatible CI bucket that is not used by production, with these GitHub Actions secrets:

```text
STUDIO_E2E_R2_ACCOUNT_ID
STUDIO_E2E_R2_ACCESS_KEY_ID
STUDIO_E2E_R2_SECRET_ACCESS_KEY
STUDIO_E2E_R2_BUCKET
STUDIO_E2E_R2_PUBLIC_BASE_URL
```

If any secret is absent, do not add a skipped/mock-only job and do not mark this task complete. Unit/component tests may continue, but the rollout gate remains closed.

**Files:**

- Modify: `app/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `app/scripts/seed-create-post-e2e.ts`
- Modify: `app/tests/e2e/frictionless-home.spec.ts`
- Modify: `app/tests/e2e/creative-directions.spec.ts`
- Modify: `app/tests/e2e/phase6-gate6-uat.spec.ts`

**Steps:**

- [ ] After the infrastructure checkpoint is signed off, add `test:studio-e2e` as `playwright test tests/e2e/frictionless-home.spec.ts`.
- [ ] Update `frictionless-home.spec.ts` to drive the progressive sequence: enter text/file/both; assert no `workId` or new work before objective; choose the objective; wait for source readiness; click `Continuar`; inspect the plan; press Enter and assert zero generate requests; click `Confirmar e gerar`; double-click guard to one accepted request; observe partial progress; retry only a failed output; refine; open versions; compare exactly two images; reload and resume the same work.
- [ ] Keep its ledger assertions through `/api/billing/history`: one initial debit per accepted generation and one idempotent refund for a controlled terminal failure. Assert no `crédito|credit` text inside the Studio main region; do not assert absence in the sidebar or billing pages.
- [ ] Extend `seed-create-post-e2e.ts` with a second dedicated synthetic login/workspace whose test-only grants are reset to zero. Write its email/password into the runtime fixture. Never modify the primary fixture balance, shared dev-admin data, or any non-E2E workspace.
- [ ] Make `frictionless-home.spec.ts` honor the seed script's existing `CREATE_POST_E2E_FIXTURE_PATH` override. In CI point both seed and Playwright to `${{ runner.temp }}/create-post-e2e.json`; do not rewrite or stage the tracked developer fixture during the gate.
- [ ] Use that isolated insufficient-balance fixture to prove: the global sidebar balance remains visible, confirmation returns the existing credit block, the prepared plan/work/sources remain unchanged, and zero outputs/jobs are created. The block shows no operation-cost estimate.
- [ ] Update `creative-directions.spec.ts`: prepare through PATCH, read `preparedPlan.preparedRevision`, send it in the direct initial-generation payload, and replace CTA cost assertions with output-count/plan assertions. Keep its exact output count, order, debit, and refund checks.
- [ ] Update only the S03 Studio selectors in `phase6-gate6-uat.spec.ts` to the explicit Continue/Confirm flow. Leave recipe and other non-Studio credit-disclosure tests unchanged.
- [ ] In CI, map the five dedicated secrets to the existing `R2_*` environment names. Set `E2E_CONTROLLED_PROVIDER=true`, `E2E_DISABLE_RATE_LIMIT=true`, and `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100`; retain fake OpenAI values so any accidental live-provider selection fails rather than spends.
- [ ] Start the built Next app and `npm run inngest:dev`, wait for `http://127.0.0.1:3000/api/health` and the local Inngest server on `http://127.0.0.1:8288`, run `npm run seed:create-post-e2e`, then `npm run test:studio-e2e`. The controlled provider, real isolated object storage, Postgres service, and real Inngest lifecycle must all participate.
- [ ] Keep the existing visual accessibility job. A browser route mock may remain as a separate smoke if already useful, but it cannot substitute for this functional job or its debit/refund assertions.
- [ ] Verify locally or in the approved CI environment:

```bash
cd app
npm test -- \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/creative-work/CreativePlanReview.test.tsx \
  src/components/creative-work/BrandInspirations.integration.test.tsx \
  src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx \
  src/server/application/prepare-creative-work.test.ts \
  src/server/application/generate-creative-work.test.ts \
  'src/app/api/creative-work/[id]/route.test.ts' \
  'src/app/api/creative-work/[id]/generate/route.test.ts'
npm run lint
npm run typecheck
CREATE_POST_E2E_FIXTURE_PATH=/tmp/adscale-studio-e2e.json npm run seed:create-post-e2e
CREATE_POST_E2E_FIXTURE_PATH=/tmp/adscale-studio-e2e.json npm run test:studio-e2e
```

Expected E2E provider cost: zero; the controlled provider is mandatory.

- [ ] Run `graphify update .`.
- [ ] Commit only after the functional CI run passes:

```bash
git add \
  app/package.json \
  .github/workflows/ci.yml \
  app/scripts/seed-create-post-e2e.ts \
  app/tests/e2e/frictionless-home.spec.ts \
  app/tests/e2e/creative-directions.spec.ts \
  app/tests/e2e/phase6-gate6-uat.spec.ts
git commit -m "test: gate progressive studio journey in ci"
```

---

## Human Gate B: Prove comprehension before traffic

Run this only after Baseline Gate A is frozen and Task 12 is green.

- [ ] Recruit 10 participants across at least three brands and two segments. Give each person only these task statements: create a piece from text; create variations from an art; refine a piece and find its previous version.
- [ ] For each participant, record task completion, objective selections, reload resume, whether generation began before explicit confirmation, and the two comprehension answers. Do not coach the interface.
- [ ] Hide the plan and ask: `O que deve permanecer igual?` and `O que o ADScale pode mudar?` Pass only when the person identifies at least two actual `preserve` items and one actual `explore` item without contradicting the plan.
- [ ] Pass only if at least 8/10 complete each task, at least 9/10 pass comprehension, nobody must choose the same objective twice, 10/10 resume after reload, no generation starts before confirmation, and insufficient balance preserves the whole work.
- [ ] Correct the three largest observed breakpoints and rerun the affected task with the failed participants. Product-owner visual approval is required before 10%.

---

## Rollout Gates: 10% → 50% → 100%

All percentage changes, deploys, and rollbacks are explicit human operations following `docs/runbooks/progressive-studio-rollout.md`.

### 10%

- [ ] Set `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=10` only after both manual gates pass.
- [ ] Hold for at least seven days, 30 eligible sessions, and 20 confirmed generations in each arm.
- [ ] Advance only if progressive completion is no more than 5 percentage points below control, abandonment no more than 5 points above, failure and refund each no more than 0.5 point above, and no critical incident occurred.

### 50%

- [ ] Set 50% and hold for at least seven days, 60 eligible sessions, and 40 confirmed generations in each arm.
- [ ] Apply the same metric and incident thresholds. Time alone never advances a stage.

### 100%

- [ ] Advance only after the 50% stage has at least 14 days, 100 eligible sessions, and 75 confirmed generations in each arm.
- [ ] At 100%, compare against the frozen Baseline Gate A because no concurrent control remains.
- [ ] Observe 100% for 14 full days before Task 13.

Immediately return the percentage to zero and investigate if there is any draft/source/output/version loss, generation before confirmation, duplicate charge, ledger/job/refund divergence, completion drop beyond 5 points, or failure/refund increase beyond 0.5 point.

---

## Task 13: Remove the temporary control presentation after 100% proves stable

**Precondition:** The 100% observation window is complete, all rollout thresholds hold, no critical incident is open, and the product owner explicitly approves cleanup.

**Files:**

- Delete: `app/src/server/studio-rollout.ts`
- Delete: `app/src/server/studio-rollout.test.ts`
- Modify: `app/src/server/validation/env.ts`
- Modify: `app/src/server/validation/env.test.ts`
- Modify: `app/src/app/(dashboard)/page.tsx`
- Modify: `app/src/app/(dashboard)/page.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/.env.example`
- Modify: `docs/CONFIGURATION.md`
- Modify: `docs/runbooks/progressive-studio-rollout.md`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Steps:**

- [ ] Add failing tests that expect the progressive presentation at `/` with no rollout prop or environment variable, while legacy `intent`, `mode`, `workId`, template, Quick Tool, campaign, and resume links still reach the same canonical protocol/work.
- [ ] Run the red cleanup slice before deleting anything:

```bash
cd app
npm test -- \
  src/server/validation/env.test.ts \
  'src/app/(dashboard)/page.test.tsx' \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx
```

Expected failure: the temporary environment flag, rollout helper, control branch, and legacy wrapper still exist.

- [ ] Remove the hash assignment helper, `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`, server branch props, and the control render branch. Keep the analytics union and send the literal `rolloutVariant: "progressive"` at the event-recording boundary so post-cleanup sessions remain measurable beside frozen historical values; this literal does not choose UI behavior.
- [ ] Remove `generateLegacy()` and control-only objective-default/restored-draft behavior. `preparePlan()` and `confirmGeneration()` become the only initial-generation path.
- [ ] Remove old dual-mode markup, translations, and tests. Keep legacy URL parsing as a compatibility adapter; it selects the explicit objective without rendering the old selector.
- [ ] Update the runbook with the final 100% evidence, cleanup commit, and rollback note. A rollback after this point is a normal code revert/deploy, not a live second implementation.
- [ ] Run the complete affected suite:

```bash
cd app
npm test -- \
  src/server/validation/env.test.ts \
  'src/app/(dashboard)/page.test.tsx' \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/creative-work/CreativePlanReview.test.tsx \
  src/components/creative-work/BrandInspirations.integration.test.tsx \
  src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx \
  src/server/beta-analytics/aggregate.test.ts
npm run lint
npm run typecheck
npm run test:studio-e2e
```

- [ ] Run `graphify update .`.
- [ ] Commit:

```bash
git add \
  app/src/server/studio-rollout.ts \
  app/src/server/studio-rollout.test.ts \
  app/src/server/validation/env.ts \
  app/src/server/validation/env.test.ts \
  'app/src/app/(dashboard)/page.tsx' \
  'app/src/app/(dashboard)/page.test.tsx' \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  app/src/components/creative-work/CreativeComposer.tsx \
  app/src/components/creative-work/CreativeComposer.test.tsx \
  app/.env.example \
  docs/CONFIGURATION.md \
  docs/runbooks/progressive-studio-rollout.md \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "refactor: remove legacy studio presentation"
```

---

## Acceptance Coverage

| Approved behavior | Proof task |
| --- | --- |
| Text, art, or both before objective | 6, 7, 12 |
| No draft/upload/autosave before objective | 6, 12 |
| Four explicit protocols; no dual mode | 6, 7, 13 |
| Per-protocol material roles/cardinalities | 2, 7 |
| Prepare and paid confirmation separated | 3, 4, 5, 7 |
| Deterministic safe plan survives reload | 2, 3, 7 |
| Stale revision and uncertain response cannot double-generate | 4, 5, 12 |
| No per-action credit value, including final state | 5, 7, 10, 12 |
| Global balance/block, debit, compensation, and refund preserved | 4, 10, 12 |
| Results take focus; partial failures remain local | 7, 9, 12 |
| Refinement preserves ancestry; compare exactly two | 3, 9, 12 |
| Campaign creation is real but secondary | 8 |
| Curated inspiration requires explicit Restyle CTA | 8 |
| Keyboard, focus, live announcements, mobile order | 7, 8, 9, 12 |
| Measured control, deterministic rollout, rollback gates | 1, 5, 11, gates |
| One final experience, no permanent parallel path | 13 |

## Final Implementation Proof

Before declaring the implementation complete:

- [ ] Every task commit contains only its listed files and `git diff --check` is clean.
- [ ] Focused tests, lint, typecheck, and functional Studio E2E pass with exact commands recorded.
- [ ] Scoped searches of the Studio components/translations find no action-level credit rendering or obsolete dual-mode markup; credit disclosure outside Studio remains untouched.
- [ ] No migration, dependency, parallel aggregate, alternate endpoint, debug code, backup file, or scratch artifact was introduced.
- [ ] CI evidence distinguishes unit/component success, functional controlled-provider success, external deploy status, analytics denominators, and human approval.
- [ ] Live/paid provider generation, production rollout changes, and final visual approval remain explicit human gates.
