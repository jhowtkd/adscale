# Frictionless Creative Flow and Operational Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the campaign-first and four-step create-post journeys with one operational home where an active brand, one request, optional sources, and one paid confirmation create a durable canonical creative work.

**Architecture:** Extend the existing `creative_work` aggregate, routes, canonical generation job, Brand Kit identity snapshot, workspace assets, templates, and canonical work list. The home, tool cards, and inspirations are adapters into the same draft; no new primary route, generation pipeline, or campaign prerequisite is introduced.

**Tech Stack:** Next.js 16.2.6 App Router, React 19, TypeScript, Zustand, TanStack Query, Zod, Drizzle/PostgreSQL, Inngest, Vitest/Testing Library, Playwright, Tailwind CSS.

## Global Constraints

- Preserve ADR 0013: `creative_work` remains the canonical standalone creative aggregate; campaigns remain optional grouping.
- Brand Training stays owned by `clientProfileId`. Incomplete training is a non-blocking quality hint.
- Every server mutation remains workspace-scoped and receives `clientProfileId` explicitly; local active-brand state is never an authorization boundary.
- Existing works never change brand when the active brand changes.
- First generation costs exactly `5 * outputCount`; three variations remain 15 credits. Brief/copy preparation reuses the pure copy generator without calling the legacy `copy_generation` spend adapter.
- Enter never confirms a paid generation. Only the quantity-and-price CTA calls the generation endpoint.
- Completed outputs are already durable and registered in the library. Approval is preference, not persistence.
- Do not add a new dashboard route group, API route tree, or module under `src/server/ai`; extend the existing `/`, `/api/creative-work`, `/api/creative-work/[id]`, and `/api/creative-work/[id]/generate` adapters.
- Keep `/quick-tools/create-post?workId=<id>` compatible until resume links are migrated; redirect the no-`workId` case to the home preset.
- Read these local Next 16 guides before editing App Router code:
  - `app/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `app/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `app/node_modules/next/dist/docs/01-app/02-guides/redirecting.md`
  - `app/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
- Follow red-green-refactor. Each task ends with focused tests and a small commit.

---

### Task 1: Establish the global active-brand contract and simplify the shell

**Files:**

- Modify: `app/src/lib/store.ts`
- Create: `app/src/lib/hooks/use-active-client-profile.ts`
- Create: `app/src/lib/hooks/use-active-client-profile.test.tsx`
- Create: `app/src/components/layout/ActiveBrandSwitcher.tsx`
- Create: `app/src/components/layout/ActiveBrandSwitcher.test.tsx`
- Modify: `app/src/components/layout/AppSidebar.tsx`
- Modify: `app/src/components/layout/AppSidebar.test.tsx`
- Modify: `app/src/components/assistant/AssistantSurfaceContext.tsx`
- Modify: `app/src/components/assistant/AssistantStartComposer.tsx`
- Modify: `app/src/components/assistant/AssistantStartComposer.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

- [ ] **Step 1: Write the failing active-brand resolution tests**

Cover exactly these cases in `use-active-client-profile.test.tsx`:

```ts
it("auto-selects the only available profile", () => {});
it("restores a persisted profile when it still belongs to the workspace", () => {});
it("clears a persisted profile that no longer exists", () => {});
it("requires one explicit choice when multiple profiles have no valid history", () => {});
```

Run:

```bash
cd app
npm test -- src/lib/hooks/use-active-client-profile.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 2: Persist only the active profile ID in the existing store**

Add this state contract to `AppState` and the Zustand `partialize` result:

```ts
activeClientProfileId: string | null;
setActiveClientProfileId: (profileId: string | null) => void;
```

Initialize it to `null`. Do not persist a profile object or workspace data.

- [ ] **Step 3: Implement one resolver for all consumers**

`useActiveClientProfile()` must combine `useClientProfiles()` with the store and return:

```ts
type ActiveClientProfileState = {
  profiles: ClientProfile[];
  activeProfile: ClientProfile | null;
  activeClientProfileId: string | null;
  requiresSelection: boolean;
  isLoading: boolean;
  selectProfile: (profileId: string) => void;
};
```

Resolution order is: one profile auto-selects; multiple profiles restore a valid persisted ID; otherwise require an explicit selection. Never auto-select `profiles[0]` when there are multiple profiles.

- [ ] **Step 4: Render the brand switcher in the shell and reduce navigation**

Place `ActiveBrandSwitcher` below the ADScale logo. Keep the user-facing navigation to `Início`, `Trabalhos`, and `Biblioteca`, with `Marca` and `Configurações` in the footer. Preserve role-gated admin access outside this user navigation.

The switcher must expose an accessible combobox when there are multiple profiles and a non-interactive named label when there is one.

- [ ] **Step 5: Remove the assistant's competing brand default**

Use `useActiveClientProfile()` in `AssistantStartComposer`. Remove the `clients[0]?.id` fallback and bridge `AssistantSurfaceContext.activeClientId` to the global ID during migration. Thread/work-specific `clientProfileId` still wins when reopening an existing assistant work.

- [ ] **Step 6: Run focused shell tests**

```bash
cd app
npm test -- src/lib/hooks/use-active-client-profile.test.tsx src/components/layout/ActiveBrandSwitcher.test.tsx src/components/layout/AppSidebar.test.tsx src/components/assistant/AssistantStartComposer.test.tsx
```

Expected: PASS; the multiple-brand test proves no silent first-profile selection.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/store.ts app/src/lib/hooks/use-active-client-profile.ts app/src/lib/hooks/use-active-client-profile.test.tsx app/src/components/layout/ActiveBrandSwitcher.tsx app/src/components/layout/ActiveBrandSwitcher.test.tsx app/src/components/layout/AppSidebar.tsx app/src/components/layout/AppSidebar.test.tsx app/src/components/assistant/AssistantSurfaceContext.tsx app/src/components/assistant/AssistantStartComposer.tsx app/src/components/assistant/AssistantStartComposer.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: add global active brand context"
```

### Task 2: Extend the canonical aggregate for drafts, sources, output plans, and versions

**Files:**

- Modify: `app/src/server/creative-work/contracts.ts`
- Modify: `app/src/server/creative-work/contracts.test.ts`
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0075_frictionless_creative_work.sql`
- Modify: `app/drizzle/meta/_journal.json`
- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/server/repositories/creative-work.test.ts`
- Modify: `app/src/server/application/generate-social-post-copy.ts`
- Modify: `app/src/server/application/generate-social-post-copy.test.ts`
- Modify: `app/src/server/application/confirm-social-post-work.ts`
- Modify: `app/src/server/application/confirm-social-post-work.test.ts`
- Modify: `app/src/server/application/select-creative-work-output.ts`
- Modify: `app/src/server/application/select-creative-work-output.test.ts`
- Modify: `app/src/server/jobs/creative-work.ts`
- Modify: `app/src/server/jobs/creative-work.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/identity-options/route.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests for the following public types and schemas:

```ts
export const CREATIVE_WORK_INTENTS = [
  "social_post",
  "variations",
  "single",
  "format_adaptation",
  "restyle",
] as const;

export const CREATIVE_SOURCE_USAGES = ["content", "style", "both"] as const;
export const CREATIVE_SOURCE_STATUSES = [
  "uploaded",
  "analyzing",
  "ready",
  "failed",
] as const;

export type CreativeWorkSettings = {
  targetFormats: Array<"1:1" | "4:5" | "9:16">;
};

export type CreativeWorkInputSnapshot = {
  request: string;
  sources: Array<{
    sourceId: string;
    assetKey: string | null;
    mimeType: string | null;
    usage: "content" | "style" | "both";
    content: ContentBrief | null;
    style: StyleBrief | null;
  }>;
};
```

Also add `quoteCreativeWork()` tests:

```ts
expect(quoteCreativeWork({ intent: "variations", format: "4:5", targetFormats: [] }))
  .toMatchObject({ unitCount: 3, credits: 15 });
expect(quoteCreativeWork({ intent: "single", format: "4:5", targetFormats: [] }))
  .toMatchObject({ unitCount: 1, credits: 5 });
expect(quoteCreativeWork({ intent: "format_adaptation", format: "4:5", targetFormats: ["1:1", "9:16"] }))
  .toMatchObject({ unitCount: 2, credits: 10 });
```

Run:

```bash
cd app
npm test -- src/server/creative-work/contracts.test.ts
```

Expected: FAIL on missing contracts.

- [ ] **Step 2: Add the minimal database fields**

Extend `creative_work_items` with:

```ts
draftKey: text("draft_key"),
title: text("title").notNull(),
request: text("request").notNull(),
campaignId: uuid("campaign_id"),
settings: jsonb("settings").$type<CreativeWorkSettings>().notNull(),
inputSnapshot: jsonb("input_snapshot").$type<CreativeWorkInputSnapshot>(),
```

Make `brief` nullable during draft preparation. Keep `format` non-null and default new drafts to `4:5` until inference or optional settings updates it.

Add a partial unique index on `(workspace_id, created_by_user_id, draft_key)` where `draft_key is not null`. New UI drafts always send a UUID `draftKey`; legacy rows remain null. This is the server-side guard against a network retry creating two works.

`campaign_id` is nullable, references an existing campaign with `ON DELETE SET NULL`, and is never required by draft creation or generation. A later association must be validated against the same workspace and cannot conflict with the work's `clientProfileId`.

Expand `tool_kind` to the five intent values above so legacy `social_post` rows remain valid.

Create `creative_work_sources` with workspace/work/profile scoping and exactly one origin:

```ts
{
  id,
  workspaceId,
  workItemId,
  assetId: uuid | null,
  templateId: uuid | null,
  usage,
  status,
  contentAnalysis: jsonb | null,
  styleAnalysis: jsonb | null,
  failureCode: text | null,
  createdAt,
  updatedAt,
}
```

Add a SQL check that exactly one of `asset_id` and `template_id` is non-null. Foreign keys from both origins use `ON DELETE CASCADE`, so deleting the only origin deletes the source row instead of violating the check.

Extend `creative_work_outputs` with:

```ts
targetFormat: text("target_format").notNull(),
versionNumber: integer("version_number").notNull().default(1),
parentOutputId: uuid("parent_output_id"),
revisionInstruction: text("revision_instruction"),
revisionAssetId: uuid("revision_asset_id"),
retryCount: integer("retry_count").notNull().default(0),
operationKey: text("operation_key").notNull(),
```

Replace the old `(work_item_id, creative_level)` unique index with `(work_item_id, creative_level, target_format, version_number)`. Add unique `(work_item_id, operation_key)`, a self foreign key for `parent_output_id`, and keep the selected-output partial unique index. Initial operation keys are deterministic from level/format/version; revisions use a client-generated UUID key.

- [ ] **Step 3: Write an explicit backward-compatible migration**

In `0075_frictionless_creative_work.sql`:

1. add nullable item columns, including `draft_key`;
2. backfill `title` from `brief->>'theme'`, `request` from the existing brief, `settings` to `{"targetFormats":[]}`;
3. set item columns non-null and `format` default `4:5`;
4. backfill every existing output `target_format` from its parent work and `operation_key` from level/format/version;
5. set output fields non-null/defaults;
6. replace the old unique index;
7. create sources and indexes/checks.

Do not rewrite IDs, statuses, output keys, billing keys, or selected flags.

- [ ] **Step 4: Guard every legacy consumer against an unprepared draft**

Because `brief` becomes nullable, update existing copy, identity-options, confirmation, selection, generate, and output-job consumers in the same commit. They must return `work_not_prepared`/HTTP 409 or skip safely when `brief` is absent; they must never use a non-null assertion. Add focused regression tests for copy, confirm, selection, generate, and the job.

- [ ] **Step 5: Expand repository methods under workspace scope**

Add repository methods for:

```ts
createCreativeWorkDraft(input)
updateCreativeWorkDraft(workspaceId, workItemId, patch)
createCreativeWorkSource(input)
updateCreativeWorkSource(workspaceId, workItemId, sourceId, patch)
deleteCreativeWorkSource(workspaceId, workItemId, sourceId)
createPlannedCreativeWorkOutputs(workspaceId, workItemId, plans)
createCreativeWorkRevision(workspaceId, workItemId, revisionKey, parentOutputId, instruction, revisionAssetId)
incrementCreativeWorkOutputRetry(workspaceId, workItemId, outputId)
linkCreativeWorkCampaign(workspaceId, workItemId, campaignId)
```

`getCreativeWork()` must return `{ work, outputs, sources }`, ordering outputs by `targetFormat`, creative level, and version number.

- [ ] **Step 6: Prove migration compatibility and repository isolation**

```bash
cd app
npm test -- src/server/creative-work/contracts.test.ts src/server/repositories/creative-work.test.ts src/server/application/generate-social-post-copy.test.ts src/server/application/confirm-social-post-work.test.ts src/server/application/select-creative-work-output.test.ts 'src/app/api/creative-work/[id]/generate/route.test.ts' src/server/jobs/creative-work.test.ts
npm run typecheck
```

Expected: PASS; repository tests reject cross-workspace source and revision access.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/creative-work/contracts.ts app/src/server/creative-work/contracts.test.ts app/src/server/db/schema.ts app/drizzle/0075_frictionless_creative_work.sql app/drizzle/meta/_journal.json app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts app/src/server/application/generate-social-post-copy.ts app/src/server/application/generate-social-post-copy.test.ts app/src/server/application/confirm-social-post-work.ts app/src/server/application/confirm-social-post-work.test.ts app/src/server/application/select-creative-work-output.ts app/src/server/application/select-creative-work-output.test.ts app/src/server/jobs/creative-work.ts app/src/server/jobs/creative-work.test.ts 'app/src/app/api/creative-work/[id]/generate/route.ts' 'app/src/app/api/creative-work/[id]/generate/route.test.ts' 'app/src/app/api/creative-work/[id]/identity-options/route.ts'
git commit -m "feat: extend canonical creative work drafts"
```

### Task 3: Make draft creation, autosave, preparation, and quote idempotent

**Files:**

- Create: `app/src/server/creative-work/prepare.ts`
- Create: `app/src/server/creative-work/prepare.test.ts`
- Create: `app/src/server/application/prepare-creative-work.ts`
- Create: `app/src/server/application/prepare-creative-work.test.ts`
- Modify: `app/src/server/application/start-social-post-work.ts`
- Modify: `app/src/server/application/start-social-post-work.test.ts`
- Modify: `app/src/app/api/creative-work/route.ts`
- Modify: `app/src/app/api/creative-work/route.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/lib/hooks/use-creative-work.test.tsx`

- [ ] **Step 1: Write failing route tests for the new one-field contract**

POST `/api/creative-work` must accept:

```json
{
  "clientProfileId": "uuid",
  "draftKey": "uuid",
  "request": "Promoção de matrícula para julho",
  "intent": "variations",
  "format": "4:5",
  "settings": { "targetFormats": [] }
}
```

Assert status 201, title `Promoção de matrícula para julho`, `brief: null`, three-unit quote, and no campaign write. Add a repeated request with the same `draftKey` and assert it returns the same work ID.

PATCH `/api/creative-work/[id]` with `{ action: "autosave", request, intent, format, settings }` must update only a draft owned by the workspace and preserve `clientProfileId`.

- [ ] **Step 2: Implement deterministic title derivation and output quote**

`deriveCreativeWorkTitle(request)` uses the first meaningful sentence, collapses whitespace, strips terminal punctuation, and truncates to 80 characters. It performs no model call.

`quoteCreativeWork()` returns concrete output plans:

```ts
type CreativeOutputPlan = {
  creativeLevel: "conservative" | "balanced" | "bold";
  targetFormat: "1:1" | "4:5" | "9:16";
  versionNumber: 1;
};
```

Legacy `social_post` maps to the same plan as `variations`.

- [ ] **Step 3: Implement preparation without a second billing event**

`prepareCreativeWork` must:

1. load the workspace-scoped draft and ready sources;
2. infer a complete `SocialPostBrief` from request plus content analyses;
3. infer/validate format and optional target formats;
4. call the existing pure `server/creative-work/copy.ts::generateSocialPostCopy` with the inferred brief and Brand Kit;
5. persist `brief`, `copy`, refined title, and settings;
6. return the deterministic quote.

Do not call `server/application/generate-social-post-copy.ts`, `spend()`, or `chargeForBatchOrApiError()` in preparation. The paid event remains image generation only.

Preparation idempotency is data-based: if request/settings/source timestamps are unchanged and valid `brief`/`copy` already exist, return persisted values without another model call.

- [ ] **Step 4: Expose preparation through the existing detail PATCH**

Extend the PATCH discriminated union with `{ action: "prepare" }`. Return 409 while any source is `uploaded` or `analyzing`; return 422 only when the request is empty and there is no ready source.

Keep the old copy/identity PATCH shape temporarily for compatibility, but remove it from new UI hooks.

- [ ] **Step 5: Add client mutations and invalidation**

Add:

```ts
useCreateCreativeWorkDraft()
useAutosaveCreativeWork()
usePrepareCreativeWork()
```

All successful mutations invalidate `creative-work`, canonical works, and the draft detail. Autosave must be safe for repeated identical payloads.

- [ ] **Step 6: Run focused tests**

```bash
cd app
npm test -- src/server/creative-work/prepare.test.ts src/server/application/prepare-creative-work.test.ts src/server/application/start-social-post-work.test.ts src/app/api/creative-work/route.test.ts 'src/app/api/creative-work/[id]/route.test.ts' src/lib/hooks/use-creative-work.test.tsx
```

Expected: PASS; the test spy proves the legacy copy spend adapter is never called by prepare.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/creative-work/prepare.ts app/src/server/creative-work/prepare.test.ts app/src/server/application/prepare-creative-work.ts app/src/server/application/prepare-creative-work.test.ts app/src/server/application/start-social-post-work.ts app/src/server/application/start-social-post-work.test.ts app/src/app/api/creative-work/route.ts app/src/app/api/creative-work/route.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/lib/hooks/use-creative-work.ts app/src/lib/hooks/use-creative-work.test.tsx
git commit -m "feat: add idempotent creative draft preparation"
```

### Task 4: Attach art and extract content, style, or both

**Files:**

- Create: `app/src/server/application/analyze-creative-work-source.ts`
- Create: `app/src/server/application/analyze-creative-work-source.test.ts`
- Create: `app/src/server/jobs/creative-work-source.ts`
- Create: `app/src/server/jobs/creative-work-source.test.ts`
- Modify: `app/src/server/ai/image-analysis.ts`
- Modify: `app/src/app/api/inngest/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Create: `app/src/components/creative-work/CreativeSourceChip.tsx`
- Create: `app/src/components/creative-work/CreativeSourceChip.test.tsx`

- [ ] **Step 1: Write source-state tests before the job**

Test independent state transitions for two sources: one may fail while the other reaches `ready`. Test `content` calls only `analyzeImageContent`, `style` calls only `analyzeImageStyle`, and `both` calls both.

Run:

```bash
cd app
npm test -- src/server/application/analyze-creative-work-source.test.ts src/server/jobs/creative-work-source.test.ts
```

Expected: FAIL because source analysis is not implemented.

- [ ] **Step 2: Reuse the existing upload trust boundary**

The browser continues uploading through `/api/workspace/assets`. Linking a source uses PATCH `/api/creative-work/[id]` with:

```ts
{ action: "attachSource", assetId: string, usage: "content" | "style" | "both" }
```

The server reloads the asset by `workspaceId`, inserts the source, and sends `creative-work.source.analyze`. Never accept an asset key, MIME type, analysis result, or workspace ID from the browser.

Support source changes with the same route:

```ts
{ action: "updateSource", sourceId: string, usage: CreativeSourceUsage }
{ action: "retrySource", sourceId: string }
{ action: "removeSource", sourceId: string }
{ action: "editSourceAnalysis", sourceId: string, content: ContentBrief | null, style: StyleBrief | null }
```

`editSourceAnalysis` validates the analyzer's Zod schemas, updates only analysis allowed by the selected usage, and invalidates prepared brief/copy so the next prepare uses the correction.

- [ ] **Step 3: Implement the durable analysis job**

First export Zod schemas for `ContentBrief` and `StyleBrief` from the existing `server/ai/image-analysis.ts` and parse model JSON before returning it. The job loads bytes from object storage and calls those existing functions. Persist only schema-validated analysis JSON. Sanitize failure codes and never store provider error text.

For a template source, do not call vision. Map its product/objective/audience/offer/target formats into content analysis, map tone/style intensity into style analysis, and mark ready synchronously.

- [ ] **Step 4: Render one inline source control**

`CreativeSourceChip` must show filename/origin, the three usage choices, independent upload/analyze/error status, collapsed extracted chips, `Revisar dados`, retry, and remove. Its status text uses `aria-live="polite"`; changing usage does not erase the file.

- [ ] **Step 5: Run focused tests**

```bash
cd app
npm test -- src/server/application/analyze-creative-work-source.test.ts src/server/jobs/creative-work-source.test.ts 'src/app/api/creative-work/[id]/route.test.ts' src/components/creative-work/CreativeSourceChip.test.tsx
npm run typecheck
```

Expected: PASS; no new API route file exists.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/application/analyze-creative-work-source.ts app/src/server/application/analyze-creative-work-source.test.ts app/src/server/jobs/creative-work-source.ts app/src/server/jobs/creative-work-source.test.ts app/src/server/ai/image-analysis.ts app/src/app/api/inngest/route.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/lib/hooks/use-creative-work.ts app/src/components/creative-work/CreativeSourceChip.tsx app/src/components/creative-work/CreativeSourceChip.test.tsx
git commit -m "feat: analyze creative sources inline"
```

### Task 5: Collapse confirmation, identity selection, charging, and dispatch into one idempotent action

**Files:**

- Create: `app/src/server/application/generate-creative-work.ts`
- Create: `app/src/server/application/generate-creative-work.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.test.ts`
- Modify: `app/src/server/creative-work/identity.ts`
- Modify: `app/src/server/creative-work/identity.test.ts`
- Modify: `app/src/server/creative-work/prompt.ts`
- Modify: `app/src/server/creative-work/prompt.test.ts`
- Modify: `app/src/server/jobs/creative-work.ts`
- Modify: `app/src/server/jobs/creative-work.test.ts`
- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`

- [ ] **Step 1: Write the failing one-confirmation tests**

Test that POST generate on a draft:

- prepares the latest request;
- ranks approved Brand Training references with `buildIdentityOptions()` and snapshots the top three;
- creates an `inputSnapshot` from ready sources;
- charges exactly the quote (`15` for variations, `5` for single);
- creates only the planned output rows;
- dispatches one event per output;
- returns the same output IDs and billing key on a repeated request.

Also test a Brand-Kit-only profile with zero approved references succeeds and returns a non-blocking `brandTrainingSuggestion`.

- [ ] **Step 2: Move orchestration out of the HTTP route**

`generateCreativeWork(input)` is the application command. The route authenticates, parses `{ action: "initial" }`, calls the command, and maps domain errors.

The command uses this sequence:

```text
load draft -> prepare if stale -> snapshot ranked identity -> snapshot sources
-> compute plans/quote -> charge batch idempotently -> insert planned outputs
-> dispatch unit events -> set generating
```

The billing key remains `creative-work:${workItemId}:initial`; unit billing keys remain derived from output IDs. Dispatch failure refunds the exact batch quote.

`createPlannedCreativeWorkOutputs` returns `{ outputs, newlyCreatedIds }`. Dispatch only `newlyCreatedIds`; a repeated request after a lost HTTP response returns the persisted rows without sending duplicate events. If the first dispatch fails, mark those rows failed and refund; recovery uses the existing per-output retry contract.

- [ ] **Step 3: Make output rows authoritative for the job**

Change `creative-work.generate` event data to `{ workspaceId, workItemId, outputId }`. The job reloads `creativeLevel`, `targetFormat`, version metadata, and revision instruction from the output row. This prevents client/event payload drift.

Build the prompt from persisted `brief`, `copy`, `identitySnapshot`, and `inputSnapshot`. Only style/both image sources become provider reference images; content extraction remains textual. Brand required/prohibited elements remain final constraints.

- [ ] **Step 4: Add one automatic retry without duplicate charge**

On the first failed attempt, atomically increment `retryCount` from 0 to 1, return the output to `queued`, and redispatch the same output ID with the same unit billing key. On the second failure, persist `failed` and expose the existing manual retry action. Completed sibling outputs remain visible throughout.

Do not retry low-quality policy rejections if the canonical policy already issued a final decision; only retry provider/transport failures that are marked retryable.

- [ ] **Step 5: Run billing, job, and route tests**

```bash
cd app
npm test -- src/server/application/generate-creative-work.test.ts 'src/app/api/creative-work/[id]/generate/route.test.ts' src/server/creative-work/identity.test.ts src/server/creative-work/prompt.test.ts src/server/jobs/creative-work.test.ts src/server/generation/canonical/charge.test.ts
```

Expected: PASS; the duplicate-call test has one batch spend, one row per plan, and stable output IDs.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/application/generate-creative-work.ts app/src/server/application/generate-creative-work.test.ts 'app/src/app/api/creative-work/[id]/generate/route.ts' 'app/src/app/api/creative-work/[id]/generate/route.test.ts' app/src/server/creative-work/identity.ts app/src/server/creative-work/identity.test.ts app/src/server/creative-work/prompt.ts app/src/server/creative-work/prompt.test.ts app/src/server/jobs/creative-work.ts app/src/server/jobs/creative-work.test.ts app/src/server/repositories/creative-work.ts app/src/lib/hooks/use-creative-work.ts
git commit -m "feat: generate creative work in one confirmation"
```

### Task 6: Build the operational home and autosaving smart composer

**Files:**

- Create: `app/src/components/creative-work/CreativeComposer.tsx`
- Create: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Create: `app/src/components/creative-work/useCreativeComposer.ts`
- Create: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Create: `app/src/components/creative-work/CreativeToolCards.tsx`
- Create: `app/src/components/creative-work/CreativeToolCards.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/app/(dashboard)/page.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

- [ ] **Step 1: Write the home interaction tests from the accepted contract**

Cover:

1. text creates one draft after the first non-empty debounced save;
2. a tool card sets the preset and focuses the same composer;
3. drag/drop uploads through `/api/workspace/assets` and then links the source;
4. Enter adds a newline and never calls generate;
5. the paid CTA reads `Gerar 3 variações · 15 créditos` and calls generate once under double click;
6. multiple brands without a valid active choice disable draft creation and focus the brand switcher;
7. a reloaded `?workId=` draft restores request, sources, and status.
8. an existing work keeps its stored brand visible when the global active brand differs.

- [ ] **Step 2: Implement a single composer state machine**

Use these UI states only:

```ts
type ComposerState =
  | "empty"
  | "saving"
  | "analyzing"
  | "ready"
  | "generating"
  | "results";
```

`useCreativeComposer` owns draft creation, 500 ms autosave, source uploads, preparation, quote, generation, and restoration. It must flush the latest autosave before the paid mutation. Use mutation `isPending` plus a local submit guard to prevent double click.

- [ ] **Step 3: Implement the approved home hierarchy**

`DashboardHomeActions` becomes:

```text
CreativeComposer
ContextualContinueHero
CreativeToolCards
BrandInspirations
```

The hero uses the canonical work list and opens the exact `resumeHref`. If no actionable work exists, show a brand-aware first-creation prompt, not a promotional banner.

The four cards are `variations`, `single`, `format_adaptation`, and `restyle`; none navigate or open a modal.

- [ ] **Step 4: Keep optional settings inline**

Add one collapsed `Ajustes opcionais` region for inferred format and target formats. Do not expose required theme/objective/audience/offer fields. The inferred summary may be reviewed, but review is never a route or step.

- [ ] **Step 5: Make the layout responsive and accessible**

Use one column on mobile, four tool cards only at large widths, visible focus rings, a button alternative to drag/drop, and polite live announcements. Essential actions remain visible without hover.

- [ ] **Step 6: Run component tests**

```bash
cd app
npm test -- src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/CreativeToolCards.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx
```

Expected: PASS; no test clicks through an intent picker, copy screen, or assets screen.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/creative-work/CreativeComposer.tsx app/src/components/creative-work/CreativeComposer.test.tsx app/src/components/creative-work/useCreativeComposer.ts app/src/components/creative-work/useCreativeComposer.test.tsx app/src/components/creative-work/CreativeToolCards.tsx app/src/components/creative-work/CreativeToolCards.test.tsx app/src/components/dashboard/DashboardHomeActions.tsx app/src/components/dashboard/DashboardHomeActions.test.tsx 'app/src/app/(dashboard)/page.tsx' app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: replace home with smart creative composer"
```

### Task 7: Show partial results immediately and create non-destructive inline versions

**Files:**

- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx`
- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx`
- Create: `app/src/components/creative-work/CreativeResultCard.tsx`
- Create: `app/src/components/creative-work/CreativeResultCard.test.tsx`
- Create: `app/src/server/application/revise-creative-work-output.ts`
- Create: `app/src/server/application/revise-creative-work-output.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.test.ts`
- Modify: `app/src/server/jobs/creative-work.ts`
- Modify: `app/src/server/jobs/creative-work.test.ts`
- Modify: `app/src/server/creative-work/projection/from-creative-work.ts`
- Modify: `app/src/server/creative-work/projection/projection.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`

- [ ] **Step 1: Write failing result and revision tests**

Test a work with two completed outputs and one processing output: completed images and actions render immediately; the processing card renders its own status. Test failed output retry only affects that card.

Test revision with `{ action: "revision", revisionKey, outputId, instruction, revisionAssetId: null }`: it creates version 2 with `parentOutputId` pointing to the original, leaves version 1 unchanged, charges 5 credits, and dispatches only the new output ID. Repeating the same `revisionKey` returns version 2 without a second charge or job.

- [ ] **Step 2: Generalize the existing proposal grid without a second results surface**

Make `CreativeProposalGrid` delegate each item to `CreativeResultCard` and support one or many planned outputs. Keep neutral conservative/balanced/bold labels for the variations preset. Remove required save/select language; use `Aprovar`, `Baixar`, and `Editar`.

Approval keeps the existing select endpoint and partial unique preference rule. It does not call `ensureCreativeWorkOutputInLibrary`, because completion already did that idempotently.

- [ ] **Step 3: Implement inline revision input**

`Editar` expands:

```text
O que você quer mudar?
[texto]
[anexo opcional]
[Gerar nova versão · 5 créditos]
```

The optional attachment uploads through the workspace asset route. The revision command reloads the parent output, creates the next version under a transaction/unique constraint, charges with `creative-work:${workItemId}:revision:${newOutputId}`, and dispatches the canonical job.

Add an optional `Agrupar em campanha` action to the work/results header. It loads existing campaigns, never creates one implicitly, and PATCHes `{ action: "linkCampaign", campaignId }` through the existing detail route. Matching workspace is mandatory; when both sides have a `clientProfileId`, they must match. Unlinking uses `campaignId: null`.

- [ ] **Step 4: Feed parent imagery into canonical generation**

For revisions, load the parent `outputKey` as the primary reference/source image, append the instruction to the prompt, and populate `GenerationRequest.source` with parent/version lineage. Keep identity and input snapshots from the work. Never overwrite the parent key.

- [ ] **Step 5: Project every version into canonical work**

Update projection so `outputs` expose the current version per level/format and `versions` include the complete ordered lineage. A completed work with no approved output remains `reviewing`, not `approved`, but all files remain saved and resumable.

- [ ] **Step 6: Run focused tests**

```bash
cd app
npm test -- src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/server/application/revise-creative-work-output.test.ts 'src/app/api/creative-work/[id]/generate/route.test.ts' 'src/app/api/creative-work/[id]/route.test.ts' src/server/jobs/creative-work.test.ts src/server/creative-work/projection/projection.test.ts
```

Expected: PASS; original keys remain unchanged after revision.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx app/src/components/creative-work/CreativeResultCard.tsx app/src/components/creative-work/CreativeResultCard.test.tsx app/src/components/creative-work/CreativeComposer.tsx app/src/components/creative-work/CreativeComposer.test.tsx app/src/server/application/revise-creative-work-output.ts app/src/server/application/revise-creative-work-output.test.ts 'app/src/app/api/creative-work/[id]/generate/route.ts' 'app/src/app/api/creative-work/[id]/generate/route.test.ts' 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/server/jobs/creative-work.ts app/src/server/jobs/creative-work.test.ts app/src/server/creative-work/projection/from-creative-work.ts app/src/server/creative-work/projection/projection.test.ts app/src/lib/hooks/use-creative-work.ts
git commit -m "feat: add partial results and creative versions"
```

### Task 8: Reuse templates and approved work as brand inspirations

**Files:**

- Create: `app/src/server/application/list-creative-inspirations.ts`
- Create: `app/src/server/application/list-creative-inspirations.test.ts`
- Modify: `app/src/app/api/creative-work/route.ts`
- Modify: `app/src/app/api/creative-work/route.test.ts`
- Create: `app/src/lib/hooks/use-creative-inspirations.ts`
- Create: `app/src/components/creative-work/BrandInspirations.tsx`
- Create: `app/src/components/creative-work/BrandInspirations.test.tsx`
- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/server/repositories/template.ts`

- [ ] **Step 1: Write the inspiration query tests**

GET `/api/creative-work?view=inspirations&clientProfileId=<profile-id>` returns only:

- templates in the current workspace;
- selected/completed outputs from works owned by the active `clientProfileId`.

It must not return unapproved outputs, another brand's output, or another workspace's template.

- [ ] **Step 2: Normalize existing sources without a recommender**

Return:

```ts
type CreativeInspiration = {
  id: string;
  source: "template" | "approved_work";
  title: string;
  previewUrl: string | null;
  templateId: string | null;
  assetId: string | null;
  suggestedIntent: CreativeWorkIntent;
};
```

Order by most recently updated/approved only. Do not score, personalize, scrape, or add a model call.

- [ ] **Step 3: Attach an inspiration to the same composer**

Clicking a template creates a template-backed source and shows content/style/both choices. Clicking an approved work creates an asset-backed source and shows the same choices. The selected origin remains visible in `CreativeSourceChip`; no navigation occurs.

- [ ] **Step 4: Run focused tests**

```bash
cd app
npm test -- src/server/application/list-creative-inspirations.test.ts src/app/api/creative-work/route.test.ts src/components/creative-work/BrandInspirations.test.tsx
```

Expected: PASS; active-brand scoping is covered by a negative test.

- [ ] **Step 5: Commit**

```bash
git add app/src/server/application/list-creative-inspirations.ts app/src/server/application/list-creative-inspirations.test.ts app/src/app/api/creative-work/route.ts app/src/app/api/creative-work/route.test.ts app/src/lib/hooks/use-creative-inspirations.ts app/src/components/creative-work/BrandInspirations.tsx app/src/components/creative-work/BrandInspirations.test.tsx app/src/server/repositories/creative-work.ts app/src/server/repositories/template.ts
git commit -m "feat: add active brand inspirations"
```

### Task 9: Migrate resume links and remove legacy happy-path friction

**Files:**

- Modify: `app/src/server/creative-work/projection/from-creative-work.ts`
- Modify: `app/src/server/creative-work/projection/projection.test.ts`
- Modify: `app/src/app/(dashboard)/quick-tools/create-post/page.tsx`
- Create: `app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.tsx`
- Create: `app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.test.tsx`
- Modify: `app/src/app/(dashboard)/campaigns/page.tsx`
- Modify: `app/src/components/campaigns/useCampaignsPage.ts`
- Modify: `app/src/components/campaigns/useCampaignsPage.test.tsx`
- Modify: `app/src/components/campaigns/NewCampaignModal.tsx`
- Modify: `app/src/components/layout/AppSidebar.tsx`
- Modify: `docs/decisions/allowed-primary-destinations.json`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

- [ ] **Step 1: Write compatibility tests first**

Assert:

```text
/quick-tools/create-post                      -> /?intent=variations
/quick-tools/create-post?workId=<id>          -> /?workId=<id>
/campaigns?new=1                              -> /?compose=1
creative_work.resumeHref                      -> /?workId=<id>
```

Use the Next 16 redirect/search-params patterns from the local docs. Preserve unrelated query parameters only when they are safe composer inputs.

- [ ] **Step 2: Remove modal invocation from the campaigns list**

`useCampaignsPage` must not open `NewCampaignModal` for `new=1`; it redirects to the focused composer. Keep the existing campaign list and campaign detail routes for optional grouping and old campaigns.

Do not delete campaign creation APIs in this delivery. Remove `NewCampaignModal` from the rendered happy path; delete the component only if `rg -n "NewCampaignModal" app/src` proves no remaining callers.

- [ ] **Step 3: Remove wizard callers after resume migration**

Replace the quick-tool page with the compatibility redirect. Run:

```bash
rg -n "CreatePostWizard|NewCampaignModal|ClientProfileLinkControl" app/src
```

Delete `CreatePostWizard` and its tests only if it has no non-test callers. Keep `ClientProfileLinkControl` inside existing legacy campaign workspaces where a historical campaign genuinely lacks a profile; it is no longer part of new creation.

- [ ] **Step 4: Update convergence documentation truth**

In `allowed-primary-destinations.json`, describe `/` as the operational composer adapter and `/quick-tools/create-post` as compatibility only. Do not add a route group or new pipeline. Update snapshots only through the existing convergence inventory command if the checker requires it.

- [ ] **Step 5: Run compatibility and convergence tests**

```bash
cd app
npm test -- src/server/creative-work/projection/projection.test.ts 'src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.test.tsx' src/components/campaigns/useCampaignsPage.test.tsx src/components/layout/AppSidebar.test.tsx
npm run convergence:check-destinations -- --base main
npm run convergence:test
```

Expected: PASS; no new primary destination or pipeline is reported.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/creative-work/projection/from-creative-work.ts app/src/server/creative-work/projection/projection.test.ts 'app/src/app/(dashboard)/quick-tools/create-post/page.tsx' 'app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.tsx' 'app/src/app/(dashboard)/quick-tools/create-post/LegacyCreatePostRedirect.test.tsx' 'app/src/app/(dashboard)/campaigns/page.tsx' app/src/components/campaigns/useCampaignsPage.ts app/src/components/campaigns/useCampaignsPage.test.tsx app/src/components/campaigns/NewCampaignModal.tsx app/src/components/layout/AppSidebar.tsx docs/decisions/allowed-primary-destinations.json app/messages/pt-BR.json app/messages/en.json
git commit -m "refactor: route legacy creation into operational home"
```

### Task 10: Prove the one-request, one-confirmation contract end to end

**Files:**

- Modify: `app/tests/e2e/create-post.spec.ts`
- Modify: `app/scripts/seed-create-post-e2e.ts`
- Create: `app/tests/e2e/frictionless-home.spec.ts`
- Modify: `app/playwright.config.ts`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/src/components/creative-work/CreativeResultCard.test.tsx`

- [ ] **Step 1: Replace wizard acceptance with the approved journey**

The Playwright flow must:

1. log in;
2. land on `/` with the single seeded brand active;
3. type one request;
4. attach one art and choose `Ambos`;
5. wait for inline analysis;
6. click exactly one paid confirmation;
7. observe completed outputs as they arrive;
8. reload and see the same work/output IDs;
9. verify campaign count is unchanged;
10. approve, download, and revise one output without losing the original.

Count user decisions in the test: no brand, client, title, copy, reference selection, or proposal selection is required before generation.

- [ ] **Step 2: Add failure recovery coverage**

Use the controlled provider to make one output fail once. Assert two siblings appear, the failed row retries automatically with the same ID and no second charge, and manual retry appears only after a second retryable failure.

Add a source-analysis failure fixture and assert the request plus other source remain intact after retry/removal.

- [ ] **Step 3: Add accessibility and responsive assertions**

At desktop and mobile widths, assert keyboard reachability, visible named actions, no essential hover-only action, polite status announcements, and no horizontal overflow. Run axe on the home and results states.

- [ ] **Step 4: Run focused and full verification**

```bash
cd app
npm test
npm run typecheck
npm run lint
npm run build
npm run convergence:gate -- --base main
npm run seed:create-post-e2e
npm run test:create-post-e2e
npx playwright test tests/e2e/frictionless-home.spec.ts
```

Expected:

- all Vitest suites pass;
- typecheck, lint, build, and convergence gate exit 0;
- E2E proves one request plus one confirmation;
- no `/api/campaigns` mutation occurs;
- reload preserves draft/generation/results;
- double click does not duplicate spend, output, or job.

- [ ] **Step 5: Verify no hidden parallel flow remains**

```bash
rg -n "Criar copy|Selecionar referências|Salvar selecionada|intentCampaign|intentSocialPost" app/src app/messages
rg -n "CreatePostWizard|NewCampaignModal" app/src
git status --short
```

Expected: the first command finds no user-facing happy-path strings, the second finds no live caller, and only intentional implementation files are modified.

- [ ] **Step 6: Commit final acceptance work**

```bash
git add app/tests/e2e/create-post.spec.ts app/scripts/seed-create-post-e2e.ts app/tests/e2e/frictionless-home.spec.ts app/playwright.config.ts app/src/components/dashboard/DashboardHomeActions.test.tsx app/src/components/creative-work/CreativeComposer.test.tsx app/src/components/creative-work/CreativeResultCard.test.tsx
git commit -m "test: prove frictionless creative flow"
```

## Completion Checklist

- [x] Home to generation is one request and one explicit paid confirmation.
- [x] Active brand is global, remembered, and copied into new works only.
- [x] Text, tool cards, attached art, templates, and approved pieces produce the same canonical draft type.
- [x] Attached art supports content, style, and both with explicit choice and independent recovery.
- [x] Drafts autosave server-side and resume from Home/Trabalhos.
- [x] Cost displayed equals cost charged; three variations cost 15 credits.
- [x] Partial outputs appear immediately and one retry is automatic/idempotent.
- [x] Every completed output is already saved; approval is optional preference.
- [x] Inline edit creates a linked version and preserves the original.
- [x] Campaign creation, copy review, and reference selection are absent from the new happy path.
- [x] Legacy links redirect correctly and convergence gates pass.
- [ ] Full unit, integration, E2E, accessibility, typecheck, lint, and build verification passes.
