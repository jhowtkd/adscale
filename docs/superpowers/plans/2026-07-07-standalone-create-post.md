# Standalone Create Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a campaign-independent creative-work core and a “Create post” Quick Tool that uses approved Brand Training assets to generate three comparable visual proposals.

**Architecture:** Persist a generic `creativeWorkItems` aggregate with one idempotent output per creative level. Build a standalone prompt from confirmed copy and an immutable identity snapshot, then reuse the existing OpenAI/storage primitives through a lower-level image generation function. Reference assets condition generation; exact assets are composed afterward with Sharp; selected output is optionally indexed in `workspaceAssets`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/PostgreSQL, Zod, TanStack Query, Inngest, OpenAI Images, Sharp, existing billing/storage services, Vitest, Testing Library, Playwright.

## Global Constraints

- This plan starts only after `2026-07-07-brand-training-approved-assets.md` is complete.
- A creative work item requires a valid `clientProfileId`; V1 never runs without a selected brand.
- `toolKind` is exactly `social_post` in V1.
- Formats are exactly `1:1`, `4:5`, and `9:16`; one work item has one format.
- Creative levels are exactly `conservative`, `balanced`, and `bold`.
- All three outputs share brief, copy, format, and identity snapshot; only creative level changes.
- No campaign, derivation, creative plan, or assistant thread row is created by this flow.
- Copy generation costs `CREDIT_COSTS.copy_generation` credits; the confirmed triplet costs `3 * CREDIT_COSTS.image_derivation` credits.
- Triplet spend is idempotent; retrying a failed output never charges again.
- Generation failures after provider invocation are not refunded; dispatch failure before any job starts refunds the triplet spend.
- Only approved training references may enter the identity snapshot.
- Exact assets are composited deterministically; they are never redrawn by the image model.
- No automatic publishing, social integration, carousel, freeform editor, or campaign UI changes.
- Do not add a third-party dependency.

---

## File Structure

### New files

- `app/src/server/creative-work/contracts.ts` — work, brief, copy, snapshot, output, placement, and API schemas.
- `app/src/server/creative-work/contracts.test.ts` — transition and validation tests.
- `app/src/server/repositories/creative-work.ts` — scoped aggregate persistence and idempotent output creation.
- `app/src/server/repositories/creative-work.test.ts` — aggregate and isolation tests.
- `app/src/server/creative-work/copy.ts` — social-post copy generation.
- `app/src/server/creative-work/copy.test.ts` — structured copy tests.
- `app/src/server/creative-work/identity.ts` — approved asset recommendation and immutable snapshot creation.
- `app/src/server/creative-work/identity.test.ts` — approval, ordering, and snapshot tests.
- `app/src/server/creative-work/prompt.ts` — standalone prompt with exact-copy and level contracts.
- `app/src/server/creative-work/prompt.test.ts` — prompt regression tests.
- `app/src/server/creative-work/composite.ts` — deterministic exact-asset placement with Sharp.
- `app/src/server/creative-work/composite.test.ts` — visual composition tests.
- `app/src/server/ai/image-generation.ts` — campaign-neutral provider call, normalization, and storage.
- `app/src/server/ai/image-generation.test.ts` — provider operation and key-prefix tests.
- `app/src/server/jobs/creative-work.ts` — one-output generation job and aggregate status refresh.
- `app/src/server/jobs/creative-work.test.ts` — success, failure, and retry tests.
- `app/src/app/api/creative-work/route.ts` — create work item.
- `app/src/app/api/creative-work/route.test.ts` — creation and profile ownership tests.
- `app/src/app/api/creative-work/[id]/route.ts` — load and update confirmed copy/assets.
- `app/src/app/api/creative-work/[id]/route.test.ts` — scoped detail/update tests.
- `app/src/app/api/creative-work/[id]/copy/route.ts` — spend and generate copy.
- `app/src/app/api/creative-work/[id]/copy/route.test.ts` — copy billing/idempotency tests.
- `app/src/app/api/creative-work/[id]/generate/route.ts` — confirm cost, create outputs, and dispatch triplet.
- `app/src/app/api/creative-work/[id]/generate/route.test.ts` — triplet and no-campaign tests.
- `app/src/app/api/creative-work/[id]/outputs/[outputId]/retry/route.ts` — retry failed output without spending again.
- `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts` — select and optionally index result in asset library.
- `app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.ts` — signed download URL.
- `app/src/lib/hooks/use-creative-work.ts` — create/load/update/generate/retry/select hooks and polling.
- `app/src/components/quick-tools/create-post/CreatePostWizard.tsx` — four-stage Quick Tool.
- `app/src/components/quick-tools/create-post/CreatePostWizard.test.tsx` — interaction and accessibility tests.
- `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx` — neutral three-proposal comparison.
- `app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx` — partial and completed states.
- `app/src/app/(dashboard)/quick-tools/create-post/page.tsx` — page entry point.
- `app/tests/e2e/create-post.spec.ts` — end-to-end no-campaign journey.
- `app/scripts/seed-create-post-e2e.ts` — deterministic profile/training fixture.

### Modified files

- `app/src/server/db/schema.ts` — `creativeWorkItems` and `creativeWorkOutputs`.
- `app/drizzle/0072_standalone_creative_work.sql` and `app/drizzle/meta/*` — generated migration.
- `app/src/server/ai/derivation-pipeline.ts` — delegate provider work to `image-generation.ts` without behavior change.
- `app/src/server/ai/derivation-pipeline.test.ts` — wrapper regression.
- `app/src/app/api/inngest/route.ts` — register creative-work job.
- `app/src/server/repositories/workspace-asset.ts` — find asset by key for idempotent save.
- `app/src/components/dashboard/v6/map-dashboard-v6.ts` — expose Create Post as the first quick action.
- `app/src/components/dashboard/v6/map-dashboard-v6.test.ts` — route regression.
- `app/messages/pt-BR.json` and `app/messages/en.json` — Quick Tool and errors.
- `app/package.json` — `seed:create-post-e2e` and `test:create-post-e2e` scripts.

---

### Task 1: Define the standalone aggregate and state machine

**Files:**
- Create: `app/src/server/creative-work/contracts.ts`
- Create: `app/src/server/creative-work/contracts.test.ts`
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0072_standalone_creative_work.sql`
- Modify: `app/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `SocialPostBrief`, `SocialPostCopy`, `CreativeWorkIdentitySnapshot`, `CreativeLevel`, work/output status types, and create/update schemas.
- Consumes: Brand Training contract types and existing workspace/profile/user tables.

- [ ] **Step 1: Write failing state and schema tests**

```ts
import { describe, expect, it } from "vitest";
import { createCreativeWorkSchema, resolveCreativeWorkStatus } from "./contracts";

describe("creative work contracts", () => {
  it("accepts a social post brief with one supported format", () => {
    expect(
      createCreativeWorkSchema.parse({
        clientProfileId: "00000000-0000-4000-8000-000000000001",
        toolKind: "social_post",
        format: "4:5",
        brief: {
          theme: "Novo produto",
          objective: "Gerar interesse",
          audience: "Empreendedores digitais",
          offer: "Teste gratuito",
        },
      }).format,
    ).toBe("4:5");
  });

  it("resolves partial when at least one output failed and one completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "failed", "completed"])).toBe("partial");
  });

  it("resolves completed only when all three outputs completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "completed", "completed"])).toBe("completed");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd app && npm test -- src/server/creative-work/contracts.test.ts`

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Implement exact contracts**

```ts
import { z } from "zod";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "@/server/brand-training/contracts";

export const CREATIVE_LEVELS = ["conservative", "balanced", "bold"] as const;
export type CreativeLevel = (typeof CREATIVE_LEVELS)[number];
export type CreativeWorkStatus = "draft" | "ready" | "generating" | "partial" | "completed" | "failed";
export type CreativeWorkOutputStatus = "queued" | "processing" | "completed" | "failed";

export const socialPostBriefSchema = z.object({
  theme: z.string().trim().min(1).max(240),
  objective: z.string().trim().min(1).max(240),
  audience: z.string().trim().min(1).max(240),
  offer: z.string().trim().min(1).max(240),
});

export const socialPostCopySchema = z.object({
  headline: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(600),
  cta: z.string().trim().min(1).max(80),
});

export type SocialPostBrief = z.infer<typeof socialPostBriefSchema>;
export type SocialPostCopy = z.infer<typeof socialPostCopySchema>;

export interface CreativeWorkIdentityAssetSnapshot {
  referenceId: string;
  assetKey: string;
  label: string;
  category: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis;
  mimeType: string;
  hasAlpha: boolean;
  placement: { gravity: "northwest" | "northeast" | "southwest" | "southeast" | "center"; widthRatio: number } | null;
}

export interface CreativeWorkIdentitySnapshot {
  clientProfileId: string;
  confirmedAt: string;
  assets: CreativeWorkIdentityAssetSnapshot[];
  brandKit: {
    colors: string[];
    fonts: string[];
    toneOfVoice: string | null;
    prohibitedElements: string | null;
    requiredElements: string | null;
  };
}

export const createCreativeWorkSchema = z.object({
  clientProfileId: z.string().uuid(),
  toolKind: z.literal("social_post"),
  format: z.enum(["1:1", "4:5", "9:16"]),
  brief: socialPostBriefSchema,
});

export function resolveCreativeWorkStatus(statuses: CreativeWorkOutputStatus[]): CreativeWorkStatus {
  if (statuses.length === 0) return "ready";
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.every((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "queued" || status === "processing")) return "generating";
  return "partial";
}
```

- [ ] **Step 4: Add both tables to Drizzle schema**

Define `creativeWorkItems` with workspace/profile/user FKs, `toolKind`, `status`, `brief` JSON, `format`, `copy` JSON, `identitySnapshot` JSON, and timestamps. Define `creativeWorkOutputs` with workspace/work FKs, `creativeLevel`, `status`, `outputKey`, `cost`, `failureCode`, `quality` JSON, `isSelected`, and timestamps.

Add:

```ts
uniqueIndex("creative_work_outputs_level_uq").on(table.workItemId, table.creativeLevel),
uniqueIndex("creative_work_outputs_selected_uq")
  .on(table.workItemId)
  .where(sql`${table.isSelected} = true`),
```

- [ ] **Step 5: Add manual migration 0072 and its journal entry**

Create `app/drizzle/0072_standalone_creative_work.sql` by following the idempotent `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` style in `0070_assistant_goal_agent.sql`. Add journal entry `idx: 71`, tag `0072_standalone_creative_work`, with a timestamp greater than migration 0071.

```sql
CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "created_by_user_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE RESTRICT,
  "tool_kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "brief" jsonb NOT NULL,
  "format" text NOT NULL,
  "copy" jsonb,
  "identity_snapshot" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_items_tool_kind_check" CHECK ("tool_kind" = 'social_post'),
  CONSTRAINT "creative_work_items_status_check" CHECK ("status" in ('draft','ready','generating','partial','completed','failed')),
  CONSTRAINT "creative_work_items_format_check" CHECK ("format" in ('1:1','4:5','9:16'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_items_scope_idx"
  ON "adscale_app"."creative_work_items" ("workspace_id", "client_profile_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_outputs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "work_item_id" uuid NOT NULL REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE CASCADE,
  "creative_level" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "output_key" text,
  "cost" integer,
  "failure_code" text,
  "quality" jsonb,
  "is_selected" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_outputs_level_check" CHECK ("creative_level" in ('conservative','balanced','bold')),
  CONSTRAINT "creative_work_outputs_status_check" CHECK ("status" in ('queued','processing','completed','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_outputs_level_uq"
  ON "adscale_app"."creative_work_outputs" ("work_item_id", "creative_level");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_outputs_selected_uq"
  ON "adscale_app"."creative_work_outputs" ("work_item_id") WHERE "is_selected" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_outputs_scope_idx"
  ON "adscale_app"."creative_work_outputs" ("workspace_id", "work_item_id", "status");
```

Expected: two new tables, required FKs, one output-per-level unique index, one-selected-output partial unique index, and workspace lookup indexes. No existing table is made nullable or repurposed.

Do not run `drizzle-kit generate`; snapshots stop at `0037` and would produce unrelated migration output.

- [ ] **Step 6: Verify contracts and migration**

Run: `cd app && npm test -- src/server/creative-work/contracts.test.ts && npm run typecheck && npx drizzle-kit check`

Expected: PASS, TypeScript exits 0, migration history valid.

- [ ] **Step 7: Commit aggregate schema**

```bash
git add app/src/server/creative-work/contracts.ts app/src/server/creative-work/contracts.test.ts app/src/server/db/schema.ts app/drizzle/0072_standalone_creative_work.sql app/drizzle/meta
git commit -m "feat: add standalone creative work aggregate"
```

---

### Task 2: Implement scoped persistence and immutable identity snapshots

**Files:**
- Create: `app/src/server/repositories/creative-work.ts`
- Create: `app/src/server/repositories/creative-work.test.ts`
- Create: `app/src/server/creative-work/identity.ts`
- Create: `app/src/server/creative-work/identity.test.ts`

**Interfaces:**
- Consumes: `getApprovedTrainingReferences`, `getBrandKit`, Task 1 contracts.
- Produces: work CRUD, idempotent triplet creation, status refresh, deterministic asset recommendation, and snapshot creation.

- [ ] **Step 1: Write failing repository tests**

Cover these exact invariants:

```ts
it("creates exactly one output per creative level", async () => {
  await createCreativeWorkOutputs("ws-1", "work-1");
  expect(valuesMock).toHaveBeenCalledWith([
    expect.objectContaining({ creativeLevel: "conservative", status: "queued" }),
    expect.objectContaining({ creativeLevel: "balanced", status: "queued" }),
    expect.objectContaining({ creativeLevel: "bold", status: "queued" }),
  ]);
});

it("loads work by workspace and id", async () => {
  await getCreativeWork("ws-1", "work-1");
  expect(whereMock).toHaveBeenCalledTimes(1);
});
```

Also test selection clears the previous selected output in one transaction and output updates require workspace, work item, and output IDs.

- [ ] **Step 2: Run repository tests and verify failure**

Run: `cd app && npm test -- src/server/repositories/creative-work.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement repository signatures**

Export:

```ts
createCreativeWork(input: { workspaceId: string; clientProfileId: string; createdByUserId: string; toolKind: "social_post"; brief: SocialPostBrief; format: "1:1" | "4:5" | "9:16" }): Promise<CreativeWorkItem>;
getCreativeWork(workspaceId: string, workItemId: string): Promise<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[] } | null>;
setCreativeWorkCopy(workspaceId: string, workItemId: string, copy: SocialPostCopy): Promise<CreativeWorkItem | null>;
confirmCreativeWorkIdentity(workspaceId: string, workItemId: string, snapshot: CreativeWorkIdentitySnapshot): Promise<CreativeWorkItem | null>;
createCreativeWorkOutputs(workspaceId: string, workItemId: string): Promise<CreativeWorkOutput[]>;
markCreativeWorkOutputProcessing(workspaceId: string, workItemId: string, outputId: string): Promise<CreativeWorkOutput | null>;
completeCreativeWorkOutput(workspaceId: string, workItemId: string, outputId: string, data: { outputKey: string; cost: number; quality: Record<string, unknown> | null }): Promise<CreativeWorkOutput | null>;
failCreativeWorkOutput(workspaceId: string, workItemId: string, outputId: string, failureCode: string): Promise<CreativeWorkOutput | null>;
refreshCreativeWorkStatus(workspaceId: string, workItemId: string): Promise<CreativeWorkStatus>;
selectCreativeWorkOutput(workspaceId: string, workItemId: string, outputId: string): Promise<CreativeWorkOutput | null>;
```

Use `onConflictDoNothing` for output insertion and then query all three rows, so repeated generate requests return the same IDs.

- [ ] **Step 4: Write failing identity tests**

```ts
it("recommends only approved references and preserves all approved rules", async () => {
  getApprovedTrainingReferencesMock.mockResolvedValue([
    approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
    approvedReference({ id: "rule", trainingCategory: "graphic", usageMode: "rule" }),
  ]);

  const result = await buildIdentityOptions("ws-1", "profile-1", socialBrief);
  expect(result.map((item) => item.referenceId)).toEqual(["logo", "rule"]);
});
```

Test category coverage ordering: logo exact, then character/graphic exact, then visual reference, then all rule-mode assets. Use normalized token overlap between brief fields and analysis text only as a tie-breaker.

- [ ] **Step 5: Implement deterministic recommendation and snapshot creation**

Export:

```ts
buildIdentityOptions(workspaceId: string, clientProfileId: string, brief: SocialPostBrief): Promise<Array<CreativeWorkIdentityAssetSnapshot & { reason: string }>>;
createIdentitySnapshot(input: { workspaceId: string; clientProfileId: string; selectedReferenceIds: string[] }): Promise<CreativeWorkIdentitySnapshot>;
```

`createIdentitySnapshot` reloads approved rows server-side and rejects any missing selected ID. Set default exact placements:

```ts
const DEFAULT_EXACT_PLACEMENT = {
  logo: { gravity: "southeast", widthRatio: 0.18 },
  graphic: { gravity: "northwest", widthRatio: 0.35 },
  character: { gravity: "southeast", widthRatio: 0.42 },
  visual_reference: null,
} as const;
```

Reject exact-mode rows without alpha metadata. Snapshot only fields needed for reproducibility and set `confirmedAt` on the server.

- [ ] **Step 6: Run repository and identity tests**

Run: `cd app && npm test -- src/server/repositories/creative-work.test.ts src/server/creative-work/identity.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit persistence and snapshots**

```bash
git add app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts app/src/server/creative-work/identity.ts app/src/server/creative-work/identity.test.ts
git commit -m "feat: persist creative work identity snapshots"
```

---

### Task 3: Generate editable copy and a standalone prompt

**Files:**
- Create: `app/src/server/creative-work/copy.ts`
- Create: `app/src/server/creative-work/copy.test.ts`
- Create: `app/src/server/creative-work/prompt.ts`
- Create: `app/src/server/creative-work/prompt.test.ts`

**Interfaces:**
- Consumes: work brief, approved voice/Brand Kit, confirmed copy, identity snapshot.
- Produces: `generateSocialPostCopy` and `buildSocialPostPrompt`.

- [ ] **Step 1: Write failing copy and prompt tests**

```ts
it("returns structured editable copy", async () => {
  openAiCreateMock.mockResolvedValue({
    choices: [{ message: { content: '{"headline":"Comece agora","body":"Conheça a solução.","cta":"Teste grátis"}' } }],
  });
  await expect(generateSocialPostCopy(input)).resolves.toEqual({
    headline: "Comece agora",
    body: "Conheça a solução.",
    cta: "Teste grátis",
  });
});

it("keeps copy and assets fixed while changing only creative level", () => {
  const conservative = buildSocialPostPrompt({ ...promptInput, creativeLevel: "conservative" });
  const bold = buildSocialPostPrompt({ ...promptInput, creativeLevel: "bold" });
  expect(conservative).toContain('HEADLINE: "Comece agora"');
  expect(bold).toContain('HEADLINE: "Comece agora"');
  expect(conservative).toContain("CREATIVE LEVEL: conservative");
  expect(bold).toContain("CREATIVE LEVEL: bold");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd app && npm test -- src/server/creative-work/copy.test.ts src/server/creative-work/prompt.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement copy generation**

Use `gpt-4o-mini`, `response_format: { type: "json_object" }`, and `socialPostCopySchema.parse`. Include brief and approved brand voice. Export:

```ts
export async function generateSocialPostCopy(input: {
  brief: SocialPostBrief;
  brandName: string;
  toneOfVoice: string | null;
  requiredElements: string | null;
  prohibitedElements: string | null;
}): Promise<SocialPostCopy>;
```

- [ ] **Step 4: Implement the standalone visual prompt**

The prompt must contain exact copy, format, level, brand rules, rule-mode findings, reference-mode descriptions, and reserved placement instructions for exact assets. Include this non-negotiable block:

```ts
const fixedContract = [
  "FIXED CONTRACT:",
  `FORMAT: ${input.format}`,
  `HEADLINE: \"${input.copy.headline}\"`,
  `BODY: \"${input.copy.body}\"`,
  `CTA: \"${input.copy.cta}\"`,
  "Do not paraphrase, translate, omit, or add visible copy.",
  "Exact assets will be composited after generation; leave clean space at their declared placements.",
].join("\n");
```

- [ ] **Step 5: Run tests**

Run: `cd app && npm test -- src/server/creative-work/copy.test.ts src/server/creative-work/prompt.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit copy and prompt**

```bash
git add app/src/server/creative-work/copy.ts app/src/server/creative-work/copy.test.ts app/src/server/creative-work/prompt.ts app/src/server/creative-work/prompt.test.ts
git commit -m "feat: build standalone branded post prompts"
```

---

### Task 4: Extract campaign-neutral image generation and exact composition

**Files:**
- Create: `app/src/server/ai/image-generation.ts`
- Create: `app/src/server/ai/image-generation.test.ts`
- Modify: `app/src/server/ai/derivation-pipeline.ts`
- Modify: `app/src/server/ai/derivation-pipeline.test.ts`
- Create: `app/src/server/creative-work/composite.ts`
- Create: `app/src/server/creative-work/composite.test.ts`

**Interfaces:**
- Consumes: existing OpenAI client behavior, safe provider fetch, format helpers, object storage, identity snapshot placements.
- Produces: `generateAndStoreImage` and `composeExactBrandAssets`.

- [ ] **Step 1: Write failing lower-level generation tests**

Assert no-reference generation calls `openai.images.generate`, reference generation calls `openai.images.edit` with an array of files, output uses the caller prefix, and 4:5/9:16 dimensions use existing format helpers.

```ts
expect(objectStoragePutMock).toHaveBeenCalledWith(
  expect.stringMatching(/^creative-work\/output-1\//),
  expect.any(Buffer),
  "image/png",
);
```

- [ ] **Step 2: Implement `generateAndStoreImage`**

Export:

```ts
export async function generateAndStoreImage(input: {
  prompt: string;
  targetFormat: "1:1" | "4:5" | "9:16";
  outputPrefix: string;
  referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
}): Promise<{ outputKey: string; revisedPrompt: string; imageOperation: "generate" | "edit"; buffer: Buffer }>;
```

Move provider call, timeout, result decoding, normalization, and storage from `executeGenerationStep` into this function. Keep the current five-minute timeout. Use `openai.images.edit` when `referenceImages.length > 0`; otherwise use `openai.images.generate`.

- [ ] **Step 3: Preserve derivation behavior through the wrapper**

Change `executeGenerationStep` to build its campaign prompt and translate `GenerationReferenceInput` into `referenceImages`, then call `generateAndStoreImage` with `outputPrefix: derivations/${ctx.derivationId}`. Preserve the existing fallback behavior for a single reference by catching edit failure only when `allowGenerateFallback` is true and retrying `generateAndStoreImage` with an empty reference array.

- [ ] **Step 4: Write failing exact-composition tests**

Create a 100x100 base and a 10x10 transparent red logo. Assert the southeast placement occupies the expected region and the input logo buffer is not mutated:

```ts
const result = await composeExactBrandAssets(base, [layer], { width: 100, height: 100 });
const pixel = await sharp(result).extract({ left: 80, top: 80, width: 1, height: 1 }).raw().toBuffer();
expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
expect(layer.buffer.equals(originalLayer)).toBe(true);
```

- [ ] **Step 5: Implement deterministic composition**

Export:

```ts
export async function composeExactBrandAssets(
  base: Buffer,
  layers: Array<{
    buffer: Buffer;
    gravity: "northwest" | "northeast" | "southwest" | "southeast" | "center";
    widthRatio: number;
  }>,
  dimensions: { width: number; height: number },
): Promise<Buffer>;
```

For each layer, resize with `fit: "inside"`, preserve aspect ratio, clamp `widthRatio` to `0.1..0.8`, and composite in snapshot order. Reject layers that Sharp reports without alpha.

- [ ] **Step 6: Run generation and regression tests**

Run: `cd app && npm test -- src/server/ai/image-generation.test.ts src/server/ai/derivation-pipeline.test.ts src/server/creative-work/composite.test.ts`

Expected: PASS, including all pre-existing derivation-pipeline snapshots.

- [ ] **Step 7: Commit provider extraction and compositor**

```bash
git add app/src/server/ai/image-generation.ts app/src/server/ai/image-generation.test.ts app/src/server/ai/derivation-pipeline.ts app/src/server/ai/derivation-pipeline.test.ts app/src/server/creative-work/composite.ts app/src/server/creative-work/composite.test.ts
git commit -m "refactor: share image generation with creative tools"
```

---

### Task 5: Add work, copy, confirmation, and triplet APIs

**Files:**
- Create: `app/src/app/api/creative-work/route.ts`
- Create: `app/src/app/api/creative-work/route.test.ts`
- Create: `app/src/app/api/creative-work/[id]/route.ts`
- Create: `app/src/app/api/creative-work/[id]/route.test.ts`
- Create: `app/src/app/api/creative-work/[id]/copy/route.ts`
- Create: `app/src/app/api/creative-work/[id]/copy/route.test.ts`
- Create: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Create: `app/src/app/api/creative-work/[id]/generate/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 repositories/services, `spendOrApiError`, `refundCredits`, and Inngest.
- Produces: create/detail/update/copy/generate HTTP contract.

- [ ] **Step 1: Write failing create/detail API tests**

Assert create validates the selected profile in the current workspace and returns `201`. Assert detail returns work plus outputs only for the authenticated workspace. Assert PATCH accepts:

```ts
const confirmCreativeWorkSchema = z.object({
  copy: socialPostCopySchema,
  selectedReferenceIds: z.array(z.string().uuid()).min(1).max(8),
});
```

PATCH must call `createIdentitySnapshot` server-side; it never trusts asset keys or analysis sent by the browser.

- [ ] **Step 2: Implement create/detail/update routes**

POST `/api/creative-work` calls `createCreativeWork` with authenticated `user.id`. GET `/api/creative-work/:id` returns 404 for a workspace mismatch. PATCH sets copy, creates the immutable snapshot, and moves the work to `ready`.

- [ ] **Step 3: Write failing copy billing tests**

Assert:

```ts
expect(spendOrApiError).toHaveBeenCalledWith({
  workspaceId: "workspace-1",
  action: "copy_generation",
  amount: 2,
  idempotencyKey: "creative-work:work-1:copy",
  metadata: { creativeWorkId: "work-1", operation_key: "copy_generation" },
  userId: "user-1",
  returnPath: "/quick-tools/create-post?workId=work-1",
});
```

Repeated copy requests return the persisted copy and do not invoke OpenAI again.

- [ ] **Step 4: Implement copy route**

Load scoped work/profile/Brand Kit, spend idempotently, call `generateSocialPostCopy`, persist it, and return `{ copy }`. If the provider fails after spend, return a sanitized 502 without deleting the work.

- [ ] **Step 5: Write failing triplet route tests**

Assert generate requires status `ready`, spends exactly 15 credits under `creative-work:work-1:triplet`, creates three outputs, sends three `creative-work.generate` events, and never imports or calls campaign/derivation repositories.

```ts
expect(inngestSend).toHaveBeenCalledWith(
  CREATIVE_LEVELS.map((creativeLevel, index) => ({
    name: "creative-work.generate",
    data: {
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: `output-${index + 1}`,
      creativeLevel,
    },
  })),
);
```

- [ ] **Step 6: Implement triplet dispatch**

Pre-check status and snapshot, call `spendOrApiError` with amount `15`, create outputs idempotently, and send the event array. If `inngest.send` throws before returning, call:

```ts
await refundCredits({
  workspaceId: "workspace-1",
  action: "image_derivation",
  idempotencyKey: "creative-work:work-1:triplet:dispatch-refund",
  amount: 15,
  metadata: { creativeWorkId: "work-1", description: "creative_work_dispatch_refund" },
  userId: "user-1",
});
```

Return `202` with work/output IDs.

- [ ] **Step 7: Run route tests**

Run: `cd app && npm test -- src/app/api/creative-work`

Expected: PASS.

- [ ] **Step 8: Commit workflow APIs**

```bash
git add app/src/app/api/creative-work
git commit -m "feat: add standalone create-post workflow APIs"
```

---

### Task 6: Generate outputs, retry failures, and save the selected result

**Files:**
- Create: `app/src/server/jobs/creative-work.ts`
- Create: `app/src/server/jobs/creative-work.test.ts`
- Modify: `app/src/app/api/inngest/route.ts`
- Create: `app/src/app/api/creative-work/[id]/outputs/[outputId]/retry/route.ts`
- Create: `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts`
- Create: `app/src/app/api/creative-work/[id]/outputs/[outputId]/download/route.ts`
- Modify: `app/src/server/repositories/workspace-asset.ts`

**Interfaces:**
- Consumes: prompt, provider, compositor, repository, storage, quality analysis.
- Produces: one-output job, free retry, idempotent select/save, signed download.

- [ ] **Step 1: Write failing job tests**

Test success sequence:

```ts
expect(markCreativeWorkOutputProcessing).toHaveBeenCalledBefore(generateAndStoreImageMock);
expect(composeExactBrandAssetsMock).toHaveBeenCalledTimes(1);
expect(completeCreativeWorkOutput).toHaveBeenCalledWith(
  "workspace-1",
  "work-1",
  "output-1",
  expect.objectContaining({ cost: 5, outputKey: expect.stringContaining("creative-work/output-1/") }),
);
expect(refreshCreativeWorkStatus).toHaveBeenCalledWith("workspace-1", "work-1");
```

Test failure stores only a sanitized code such as `provider_failed`, refreshes aggregate status, and does not refund. Test a duplicate event returns without invoking the provider when output is already completed.

- [ ] **Step 2: Implement the one-output Inngest job**

Create function id `generate-creative-work-output`, retries `0`, event `creative-work.generate`. Load the scoped work/output, skip completed output, mark processing, build prompt, load up to four `reference` asset buffers, generate base, load and compose every `exact` layer, overwrite the generated key with the composed PNG, run `analyzeDerivationCreative` using brief fields as evaluation context, complete/fail the output, and refresh aggregate status in `finally`.

- [ ] **Step 3: Register the job**

Add `creativeWorkOutputJob` once to the Inngest function list.

- [ ] **Step 4: Write and implement retry route**

The route loads the scoped work/output and accepts only `failed`. It resets the same output row to `queued` and sends the same event with the same output ID. It does not call any billing function because the triplet charge already covers this output.

- [ ] **Step 5: Write and implement select/save route**

Accept `{ saveToLibrary: z.boolean().default(true) }`. Select only a completed output. If saving, use `getWorkspaceAssetByKey` before `createWorkspaceAsset`:

```ts
await createWorkspaceAsset({
  workspaceId,
  name: `Post ${work.brief.theme} - ${output.creativeLevel}`,
  key: output.outputKey,
  type: "image/png",
  size: Number((await objectStorage.head(output.outputKey))?.contentLength ?? 0),
  source: "creative_work",
});
```

Repeated select calls must reuse the existing workspace asset.

- [ ] **Step 6: Write and implement signed-download route**

Return `{ url: await objectStorage.signedDownloadUrl(output.outputKey) }` only for a completed output scoped to the current workspace/work item.

- [ ] **Step 7: Run job and output-route tests**

Run: `cd app && npm test -- src/server/jobs/creative-work.test.ts 'src/app/api/creative-work/[id]/outputs'`

Expected: PASS.

- [ ] **Step 8: Commit generation and output actions**

```bash
git add app/src/server/jobs/creative-work.ts app/src/server/jobs/creative-work.test.ts app/src/app/api/inngest/route.ts 'app/src/app/api/creative-work/[id]/outputs' app/src/server/repositories/workspace-asset.ts
git commit -m "feat: generate and save branded post proposals"
```

---

### Task 7: Build the four-stage Create Post UI and dashboard entry

**Files:**
- Create: `app/src/lib/hooks/use-creative-work.ts`
- Create: `app/src/components/quick-tools/create-post/CreatePostWizard.tsx`
- Create: `app/src/components/quick-tools/create-post/CreatePostWizard.test.tsx`
- Create: `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx`
- Create: `app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx`
- Create: `app/src/app/(dashboard)/quick-tools/create-post/page.tsx`
- Modify: `app/src/components/dashboard/v6/map-dashboard-v6.ts`
- Modify: `app/src/components/dashboard/v6/map-dashboard-v6.test.ts`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Interfaces:**
- Consumes: all APIs from Tasks 5-6 and existing client-profile hook.
- Produces: `/quick-tools/create-post` and a dashboard quick-action link.

- [ ] **Step 1: Write failing wizard tests**

Cover the approved four stages:

```tsx
it("requires brand and brief before copy generation", async () => {
  render(<CreatePostWizard />, { wrapper: createWrapper() });
  expect(screen.getByRole("combobox", { name: "Marca" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Criar copy" })).toBeDisabled();
});

it("shows the 15-credit confirmation before visual generation", async () => {
  renderReadyWizard();
  expect(await screen.findByText("15 créditos")).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar e gerar 3 propostas" })).toBeEnabled();
});
```

Test editable copy, selectable recommended assets, format choice, partial output retry, neutral level labels, select/save, and download.

- [ ] **Step 2: Run UI tests and verify failure**

Run: `cd app && npm test -- src/components/quick-tools/create-post`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement hooks and polling**

Use query key `["creative-work", workItemId]`. Poll every two seconds only when status is `generating`; stop for `partial`, `completed`, or `failed`. Mutations invalidate the work query and `["workspace-assets"]` after save.

- [ ] **Step 4: Implement the wizard stages**

1. Required brand select, four brief fields, one native radio group for format.
2. Generated headline/body/CTA fields remain editable.
3. Recommended approved assets show category, mode, and reason; selection is explicit.
4. Proposal grid shows the three levels in fixed neutral order.

Every async region uses `role="status"`; every error uses `role="alert"`; step navigation preserves entered values.

- [ ] **Step 5: Implement partial and completed proposal grid**

Each failed card exposes `Repetir esta proposta`. Completed cards expose `Selecionar`, `Salvar na biblioteca`, and `Baixar`. Do not label one option as recommended or best.

- [ ] **Step 6: Add page and dashboard entry**

Page renders a heading and `CreatePostWizard`. Prepend a static quick action to `recipes` in `mapDashboardToV6View`:

```ts
const createPost: DashboardV6Recipe = {
  id: "quick-tool-create-post",
  icon: "✦",
  name: tHero("createPostName"),
  desc: tHero("createPostDescription"),
  count: tHero("createPostCount"),
  href: "/quick-tools/create-post",
};
```

Update the map function to return `[createPost, ...templateRecipes].slice(0, 4)` and add localized labels.

- [ ] **Step 7: Run UI and dashboard tests**

Run: `cd app && npm test -- src/components/quick-tools/create-post src/components/dashboard/v6/map-dashboard-v6.test.ts && npx eslint src/components/quick-tools/create-post src/lib/hooks/use-creative-work.ts 'src/app/(dashboard)/quick-tools/create-post/page.tsx'`

Expected: PASS and ESLint exits 0.

- [ ] **Step 8: Commit UI**

```bash
git add app/src/lib/hooks/use-creative-work.ts app/src/components/quick-tools/create-post 'app/src/app/(dashboard)/quick-tools/create-post/page.tsx' app/src/components/dashboard/v6/map-dashboard-v6.ts app/src/components/dashboard/v6/map-dashboard-v6.test.ts app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: add create-post quick tool"
```

---

### Task 8: Prove end-to-end isolation, fidelity, and resumability

**Files:**
- Create: `app/scripts/seed-create-post-e2e.ts`
- Create: `app/tests/e2e/create-post.spec.ts`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: complete Brand Training and Create Post flows.
- Produces: deterministic acceptance evidence and release commands.

- [ ] **Step 1: Add a deterministic seed script**

Seed one workspace, two client profiles, one approved transparent logo, one approved reference asset, one pending asset, and a ready work fixture. Write IDs to `app/tests/fixtures/create-post-e2e.json`. Never use production credentials or external customer data.

- [ ] **Step 2: Add package scripts**

```json
"seed:create-post-e2e": "tsx scripts/seed-create-post-e2e.ts",
"test:create-post-e2e": "playwright test tests/e2e/create-post.spec.ts"
```

- [ ] **Step 3: Write end-to-end acceptance tests**

Test:

```ts
test("trains assets and creates a post without a campaign", async ({ page, request }) => {
  const before = await request.get("/api/campaigns");
  const beforeCount = ((await before.json()) as { campaigns: unknown[] }).campaigns.length;

  await page.goto("/quick-tools/create-post");
  await page.getByRole("combobox", { name: "Marca" }).selectOption(fixture.clientProfileId);
  await page.getByLabel("Tema").fill("Novo produto");
  await page.getByLabel("Objetivo").fill("Gerar interesse");
  await page.getByLabel("Público").fill("Empreendedores");
  await page.getByLabel("Oferta").fill("Teste gratuito");
  await page.getByLabel("4:5").check();
  await page.getByRole("button", { name: "Criar copy" }).click();
  await expect(page.getByLabel("Título")).not.toHaveValue("");

  const after = await request.get("/api/campaigns");
  const afterCount = ((await after.json()) as { campaigns: unknown[] }).campaigns.length;
  expect(afterCount).toBe(beforeCount);
});
```

Add API-backed tests for pending asset exclusion, three fixed levels, partial retry using the same output ID, selection persistence after reload, and signed download.

- [ ] **Step 4: Add exact-composition visual assertion**

Use the seeded logo and a deterministic generated-base fixture. Compare the expected logo region with Sharp `stats()` and require zero channel difference after the planned resize/composition transform.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
cd app
npm test -- src/server/creative-work src/server/repositories/creative-work.test.ts src/server/ai/image-generation.test.ts src/server/jobs/creative-work.test.ts src/app/api/creative-work src/components/quick-tools/create-post src/components/dashboard/v6/map-dashboard-v6.test.ts
npm run typecheck
npm run lint
npm run build
npx drizzle-kit check
npm run seed:create-post-e2e
npm run test:create-post-e2e
```

Expected: all focused tests PASS, typecheck/lint/build exit 0, Drizzle is valid, and Playwright confirms no campaign count change.

- [ ] **Step 6: Inspect final scope**

Run: `git diff --stat HEAD~8..HEAD && git status --short`

Expected: only Brand Training/creative-work/Quick Tool files and generated migrations are part of this feature; no unrelated dirty files are staged.

- [ ] **Step 7: Commit the release gate**

```bash
git add app/scripts/seed-create-post-e2e.ts app/tests/e2e/create-post.spec.ts app/package.json
git commit -m "test: verify standalone branded post flow"
```
