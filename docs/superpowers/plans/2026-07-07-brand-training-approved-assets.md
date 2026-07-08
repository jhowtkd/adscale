# Approved Brand Training Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing Brand Training into an independent, profile-scoped library of AI-analyzed visual assets that only becomes available to generators after human approval.

**Architecture:** Keep `workspaceAssets` as the binary catalog and extend `clientReferences` as the profile-specific training binding. A dedicated upload/list API creates pending references and dispatches an Inngest analysis job; a profile-scoped review API is the only path to approval. The existing wizard gains an asset-training panel and continues to own Brand Kit and voice training.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/PostgreSQL, Zod, TanStack Query, Inngest, OpenAI, Sharp, Vitest, Testing Library.

## Global Constraints

- Scope every read and write by both `workspaceId` and `clientProfileId`.
- V1 categories are exactly `logo`, `graphic`, `character`, and `visual_reference`.
- V1 usage modes are exactly `exact`, `reference`, and `rule`.
- V1 review states are exactly `pending_analysis`, `pending_approval`, `approved`, and `archived`.
- AI analysis never approves an asset; only an authenticated user review can set `approved`.
- Legacy `clientReferences` rows remain valid references but are not trained assets until reviewed.
- Exact-mode raster uploads require alpha; SVG uploads are rasterized to PNG and the original SVG is never served.
- Do not add a new asset library, model-training service, or third-party dependency.
- Existing campaigns and generation behavior remain unchanged in this plan.

---

## File Structure

### New files

- `app/src/server/brand-training/contracts.ts` — shared categories, modes, review states, analysis type, and Zod review validation.
- `app/src/server/brand-training/contracts.test.ts` — contract and exact-mode validation tests.
- `app/src/server/brand-training/upload.ts` — training-only upload normalization, alpha detection, and SVG rasterization.
- `app/src/server/brand-training/upload.test.ts` — upload normalization tests.
- `app/src/server/jobs/brand-training.ts` — async analysis and transition from `pending_analysis` to `pending_approval`.
- `app/src/server/jobs/brand-training.test.ts` — analysis-job tests.
- `app/src/app/api/client-profiles/[id]/training-assets/route.ts` — list and upload trained assets.
- `app/src/app/api/client-profiles/[id]/training-assets/route.test.ts` — ownership, upload, and listing tests.
- `app/src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.ts` — review, approve, or archive one trained asset.
- `app/src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.test.ts` — review transition tests.
- `app/src/components/brand-training/BrandTrainingAssets.tsx` — upload, analysis status, review editor, and approved gallery.
- `app/src/components/brand-training/BrandTrainingAssets.test.tsx` — accessible UI state tests.

### Modified files

- `app/src/server/db/schema.ts` — add training metadata to `clientReferences`.
- `app/drizzle/0071_brand_training_assets.sql` and `app/drizzle/meta/*` — generated migration and journal.
- `app/src/server/repositories/client-reference.ts` — create, list, analyze, and review trained references.
- `app/src/server/repositories/client-reference.test.ts` — repository scope and transition tests.
- `app/src/server/repositories/workspace-asset.ts` — persist training metadata and load assets by key.
- `app/tests/unit/repositories/workspace-asset.test.ts` — metadata and key lookup tests.
- `app/src/app/api/inngest/route.ts` — register the training analysis job.
- `app/src/lib/hooks/use-brand-training.ts` — trained-asset query and mutations.
- `app/src/components/brand-training/BrandTrainingWizard.tsx` — mount the independent asset panel in the curation step.
- `app/src/components/brand-training/BrandTrainingWizard.test.tsx` — verify panel/profile wiring.
- `app/src/server/brand-profile/trained-status.ts` — count only approved visual training signals.
- `app/src/server/brand-profile/trained-status.test.ts` — status regression coverage.
- `app/messages/pt-BR.json` and `app/messages/en.json` — labels, statuses, validation, and errors.

---

### Task 1: Lock training contracts and database shape

**Files:**
- Create: `app/src/server/brand-training/contracts.ts`
- Create: `app/src/server/brand-training/contracts.test.ts`
- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0071_brand_training_assets.sql`
- Modify: `app/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `BrandTrainingCategory`, `BrandTrainingUsageMode`, `BrandTrainingReviewStatus`, `BrandTrainingAnalysis`, `reviewTrainingAssetSchema`, and the new nullable `clientReferences` columns.
- Consumes: existing `user`, `clientReferences`, and Drizzle migration conventions.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { reviewTrainingAssetSchema } from "./contracts";

describe("brand training contracts", () => {
  it("accepts the four V1 categories and three usage modes", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "graphic",
      usageMode: "reference",
      analysis: {
        description: "Ondas verdes usadas como moldura.",
        visualAttributes: ["green", "rounded"],
        rules: ["Preserve aspect ratio"],
        constraints: ["Do not recolor"],
        confidence: 0.91,
      },
      reviewStatus: "approved",
    });

    expect(parsed.trainingCategory).toBe("graphic");
    expect(parsed.usageMode).toBe("reference");
  });

  it("rejects approval without a completed analysis", () => {
    expect(() =>
      reviewTrainingAssetSchema.parse({
        trainingCategory: "logo",
        usageMode: "exact",
        analysis: null,
        reviewStatus: "approved",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `cd app && npm test -- src/server/brand-training/contracts.test.ts`

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Implement the shared contracts**

```ts
import { z } from "zod";

export const BRAND_TRAINING_CATEGORIES = [
  "logo",
  "graphic",
  "character",
  "visual_reference",
] as const;
export const BRAND_TRAINING_USAGE_MODES = ["exact", "reference", "rule"] as const;
export const BRAND_TRAINING_REVIEW_STATUSES = [
  "pending_analysis",
  "pending_approval",
  "approved",
  "archived",
] as const;

export type BrandTrainingCategory = (typeof BRAND_TRAINING_CATEGORIES)[number];
export type BrandTrainingUsageMode = (typeof BRAND_TRAINING_USAGE_MODES)[number];
export type BrandTrainingReviewStatus = (typeof BRAND_TRAINING_REVIEW_STATUSES)[number];

export const brandTrainingAnalysisSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  visualAttributes: z.array(z.string().trim().min(1).max(120)).max(20),
  rules: z.array(z.string().trim().min(1).max(240)).max(20),
  constraints: z.array(z.string().trim().min(1).max(240)).max(20),
  confidence: z.number().min(0).max(1),
});

export type BrandTrainingAnalysis = z.infer<typeof brandTrainingAnalysisSchema>;

export const reviewTrainingAssetSchema = z
  .object({
    trainingCategory: z.enum(BRAND_TRAINING_CATEGORIES),
    usageMode: z.enum(BRAND_TRAINING_USAGE_MODES),
    analysis: brandTrainingAnalysisSchema.nullable(),
    reviewStatus: z.enum(["approved", "archived"]),
  })
  .superRefine((value, ctx) => {
    if (value.reviewStatus === "approved" && value.analysis === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analysis"],
        message: "Approved training assets require analysis",
      });
    }
  });
```

- [ ] **Step 4: Add nullable training columns to `clientReferences`**

Add these fields beside `kind` and `notes` in `app/src/server/db/schema.ts`:

```ts
trainingCategory: text("training_category").$type<
  import("../brand-training/contracts").BrandTrainingCategory
>(),
usageMode: text("usage_mode").$type<
  import("../brand-training/contracts").BrandTrainingUsageMode
>(),
trainingAnalysis: jsonb("training_analysis").$type<
  import("../brand-training/contracts").BrandTrainingAnalysis
>(),
reviewStatus: text("review_status").$type<
  import("../brand-training/contracts").BrandTrainingReviewStatus
>(),
reviewedAt: timestamp("reviewed_at", { mode: "date" }),
reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
  onDelete: "set null",
}),
```

Add the lookup index:

```ts
index("client_references_training_lookup_idx").on(
  table.workspaceId,
  table.clientProfileId,
  table.reviewStatus,
),
```

- [ ] **Step 5: Add the manual migration and journal entry**

Create `app/drizzle/0071_brand_training_assets.sql` with idempotent `ADD COLUMN IF NOT EXISTS`, the reviewer foreign key in a guarded `DO` block, and `CREATE INDEX IF NOT EXISTS`. Add journal entry `idx: 70`, tag `0071_brand_training_assets`, and a timestamp greater than migration 0070.

```sql
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "training_category" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "usage_mode" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "training_analysis" jsonb;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "review_status" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_references_reviewed_by_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "adscale_app"."client_references"
      ADD CONSTRAINT "client_references_reviewed_by_user_id_user_id_fk"
      FOREIGN KEY ("reviewed_by_user_id") REFERENCES "adscale_app"."user"("id")
      ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_references_training_lookup_idx"
  ON "adscale_app"."client_references" ("workspace_id", "client_profile_id", "review_status");
```

Do not run `drizzle-kit generate`: this repository's generated snapshots stop at `0037`, while migrations `0038` through `0070` are manual and journaled. Generation from the stale snapshot would re-emit unrelated schema changes.

The SQL must contain only the six nullable columns, reviewer foreign key, and lookup index.

- [ ] **Step 6: Run contract, type, and migration checks**

Run: `cd app && npm test -- src/server/brand-training/contracts.test.ts && npm run typecheck && npx drizzle-kit check`

Expected: tests PASS, TypeScript exits 0, and Drizzle prints `Everything's fine`.

- [ ] **Step 7: Commit the contract and migration**

```bash
git add app/src/server/brand-training/contracts.ts app/src/server/brand-training/contracts.test.ts app/src/server/db/schema.ts app/drizzle/0071_brand_training_assets.sql app/drizzle/meta
git commit -m "feat: add brand training asset contracts"
```

---

### Task 2: Persist and query trained references safely

**Files:**
- Modify: `app/src/server/repositories/client-reference.ts`
- Modify: `app/src/server/repositories/client-reference.test.ts`

**Interfaces:**
- Consumes: Task 1 contract types and nullable schema columns.
- Produces:
  - `createTrainingReference(workspaceId, input)`
  - `getTrainingReferences(workspaceId, clientProfileId)`
  - `getApprovedTrainingReferences(workspaceId, clientProfileId)`
  - `recordTrainingAnalysis(scope, analysis)`
  - `reviewTrainingReference(scope, review)`

- [ ] **Step 1: Add failing repository tests for scope and approval**

Add test cases that assert the exact write payload and workspace/profile/reference scope:

```ts
it("creates a pending training reference", async () => {
  returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "pending_analysis" }]);

  await createTrainingReference("ws-1", {
    clientProfileId: "profile-1",
    assetKey: "workspaces/ws-1/assets/a.png",
    label: "Ondas",
  });

  expect(valuesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      kind: "other",
      reviewStatus: "pending_analysis",
    }),
  );
});

it("records human approval with reviewer identity", async () => {
  returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "approved" }]);

  const result = await reviewTrainingReference(
    { workspaceId: "ws-1", clientProfileId: "profile-1", referenceId: "ref-1" },
    {
      trainingCategory: "graphic",
      usageMode: "exact",
      analysis: {
        description: "Ondas",
        visualAttributes: ["green"],
        rules: ["Keep proportions"],
        constraints: ["Do not recolor"],
        confidence: 0.9,
      },
      reviewStatus: "approved",
      reviewedByUserId: "user-1",
    },
  );

  expect(result?.reviewStatus).toBe("approved");
  expect(whereMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `cd app && npm test -- src/server/repositories/client-reference.test.ts`

Expected: FAIL because the five training repository functions are not exported.

- [ ] **Step 3: Implement exact repository signatures**

Add these inputs and functions, using `and`, `eq`, and `desc` exactly as existing repository methods do:

```ts
export interface CreateTrainingReferenceInput {
  clientProfileId: string;
  assetKey: string;
  label: string;
}

export async function createTrainingReference(
  workspaceId: string,
  input: CreateTrainingReferenceInput,
) {
  const [row] = await db
    .insert(clientReferences)
    .values({
      workspaceId,
      clientProfileId: input.clientProfileId,
      assetKey: input.assetKey,
      label: input.label,
      kind: "other",
      reviewStatus: "pending_analysis",
    })
    .returning();
  return row;
}

export async function getTrainingReferences(workspaceId: string, clientProfileId: string) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        inArray(clientReferences.reviewStatus, [
          "pending_analysis",
          "pending_approval",
          "approved",
          "archived",
        ]),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getApprovedTrainingReferences(workspaceId: string, clientProfileId: string) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        eq(clientReferences.reviewStatus, "approved"),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}
```

Implement analysis and review updates with all three IDs in the `WHERE`. `recordTrainingAnalysis` must only update `pending_analysis`; `reviewTrainingReference` must accept only current `pending_approval`, `approved`, or `archived` rows and must set `reviewedAt: new Date()`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd app && npm test -- src/server/repositories/client-reference.test.ts && npm run typecheck`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 5: Commit repository support**

```bash
git add app/src/server/repositories/client-reference.ts app/src/server/repositories/client-reference.test.ts
git commit -m "feat: persist approved brand training assets"
```

---

### Task 3: Normalize uploads and expose profile-scoped upload/list API

**Files:**
- Create: `app/src/server/brand-training/upload.ts`
- Create: `app/src/server/brand-training/upload.test.ts`
- Create: `app/src/app/api/client-profiles/[id]/training-assets/route.ts`
- Create: `app/src/app/api/client-profiles/[id]/training-assets/route.test.ts`
- Modify: `app/src/server/repositories/workspace-asset.ts`
- Modify: `app/tests/unit/repositories/workspace-asset.test.ts`

**Interfaces:**
- Consumes: `createWorkspaceAsset`, `objectStorage`, `createTrainingReference`, `getTrainingReferences`, and `inngest`.
- Produces: `normalizeTrainingUpload(file): Promise<{ buffer; type; extension; hasAlpha }>` and `GET/POST /api/client-profiles/:id/training-assets`.

- [ ] **Step 1: Write failing upload tests**

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeTrainingUpload } from "./upload";

describe("normalizeTrainingUpload", () => {
  it("detects alpha in a transparent PNG", async () => {
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const file = new File([buffer], "logo.png", { type: "image/png" });

    await expect(normalizeTrainingUpload(file)).resolves.toMatchObject({
      type: "image/png",
      extension: "png",
      hasAlpha: true,
    });
  });

  it("rasterizes SVG and never returns SVG content", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#00ff00"/></svg>';
    const file = new File([svg], "mark.svg", { type: "image/svg+xml" });
    const result = await normalizeTrainingUpload(file);

    expect(result.type).toBe("image/png");
    expect(result.extension).toBe("png");
    expect(result.buffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});
```

- [ ] **Step 2: Run the upload test and verify it fails**

Run: `cd app && npm test -- src/server/brand-training/upload.test.ts`

Expected: FAIL because `normalizeTrainingUpload` does not exist.

- [ ] **Step 3: Implement upload normalization with existing Sharp**

Implement these rules in `upload.ts`:

```ts
const MAX_TRAINING_ASSET_BYTES = 10 * 1024 * 1024;
const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function normalizeTrainingUpload(file: File) {
  if (file.size <= 0 || file.size > MAX_TRAINING_ASSET_BYTES) {
    throw new Error("invalid_size");
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (file.type === "image/svg+xml") {
    const buffer = await sharp(input, { limitInputPixels: 40_000_000 }).png().toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { buffer, type: "image/png" as const, extension: "png" as const, hasAlpha: metadata.hasAlpha === true };
  }

  if (!RASTER_TYPES.has(file.type)) throw new Error("invalid_type");
  const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  if (metadata.format !== "png" && metadata.format !== "jpeg" && metadata.format !== "webp") {
    throw new Error("invalid_type");
  }
  const extension = metadata.format === "jpeg" ? "jpg" : metadata.format === "webp" ? "webp" : "png";
  return {
    buffer: input,
    type: file.type as "image/png" | "image/jpeg" | "image/webp",
    extension,
    hasAlpha: metadata.hasAlpha === true,
  };
}
```

- [ ] **Step 4: Persist upload metadata and add key lookup**

Extend `CreateWorkspaceAssetInput` with `metadata?: Record<string, unknown>` and pass it into the insert. Add:

```ts
export async function getWorkspaceAssetByKey(workspaceId: string, key: string) {
  const [row] = await db
    .select()
    .from(workspaceAssets)
    .where(and(eq(workspaceAssets.workspaceId, workspaceId), eq(workspaceAssets.key, key)))
    .limit(1);
  return row ?? null;
}
```

Add repository tests that assert both workspace and key appear in the query, and that `createWorkspaceAsset` passes `{ hasAlpha: true, originalMimeType: "image/svg+xml" }` metadata unchanged.

- [ ] **Step 5: Write failing API tests for ownership and dispatch**

Test that POST:

```ts
expect(getClientProfile).toHaveBeenCalledWith("workspace-1", "profile-1");
expect(createWorkspaceAsset).toHaveBeenCalledWith(
  expect.objectContaining({ workspaceId: "workspace-1", source: "brand_training" }),
);
expect(createTrainingReference).toHaveBeenCalledWith(
  "workspace-1",
  expect.objectContaining({ clientProfileId: "profile-1" }),
);
expect(inngestSend).toHaveBeenCalledWith({
  name: "brand.training.analyze",
  data: {
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    referenceId: "ref-1",
    assetKey: expect.any(String),
    mimeType: "image/png",
    hasAlpha: true,
  },
});
```

Also assert 404 for an out-of-workspace profile and that GET calls `getTrainingReferences("workspace-1", "profile-1")`.

- [ ] **Step 6: Implement the route**

Use `requireWorkspaceAccess`, `getClientProfile`, `normalizeTrainingUpload`, `sanitizeStorageFilename`, `objectStorage.put`, `createWorkspaceAsset`, `createTrainingReference`, and `inngest.send`. Persist under:

```ts
const key = `workspaces/${workspace.id}/brand-training/${crypto.randomUUID()}-${safeName}.${normalized.extension}`;
```

Return `201` with:

```ts
return NextResponse.json(
  { reference: { ...reference, asset, url: objectStorage.publicUrl(key) } },
  { status: 201 },
);
```

Pass upload facts into `createWorkspaceAsset`:

```ts
metadata: {
  hasAlpha: normalized.hasAlpha,
  originalMimeType: file.type,
},
```

GET resolves every reference's workspace asset with `getWorkspaceAssetByKey`, omits broken bindings, and adds `url: objectStorage.publicUrl(asset.key)`. It never accepts a workspace ID from query parameters.

If DB creation fails after upload, delete the object. If reference creation fails after asset creation, delete both the workspace asset row and object using existing repository/storage functions.

- [ ] **Step 7: Run focused tests**

Run: `cd app && npm test -- src/server/brand-training/upload.test.ts 'src/app/api/client-profiles/[id]/training-assets/route.test.ts' tests/unit/repositories/workspace-asset.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit upload and listing**

```bash
git add app/src/server/brand-training/upload.ts app/src/server/brand-training/upload.test.ts 'app/src/app/api/client-profiles/[id]/training-assets/route.ts' 'app/src/app/api/client-profiles/[id]/training-assets/route.test.ts' app/src/server/repositories/workspace-asset.ts app/tests/unit/repositories/workspace-asset.test.ts
git commit -m "feat: upload profile-scoped brand training assets"
```

---

### Task 4: Analyze assets asynchronously and require human review

**Files:**
- Create: `app/src/server/jobs/brand-training.ts`
- Create: `app/src/server/jobs/brand-training.test.ts`
- Modify: `app/src/app/api/inngest/route.ts`
- Create: `app/src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.ts`
- Create: `app/src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.test.ts`

**Interfaces:**
- Consumes: `recordTrainingAnalysis`, `reviewTrainingReference`, Task 1 contracts, object storage, and existing OpenAI configuration.
- Produces: Inngest event `brand.training.analyze` and `PATCH /api/client-profiles/:id/training-assets/:referenceId`.

- [ ] **Step 1: Write the failing job test**

Mock OpenAI, object storage, and repository update; assert:

```ts
expect(recordTrainingAnalysis).toHaveBeenCalledWith(
  {
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    referenceId: "ref-1",
  },
  {
    trainingCategory: "graphic",
    usageMode: "reference",
    analysis: expect.objectContaining({ description: "Ondas verdes" }),
  },
);
```

Assert the job never writes `reviewStatus: "approved"`.

- [ ] **Step 2: Run the job test and verify it fails**

Run: `cd app && npm test -- src/server/jobs/brand-training.test.ts`

Expected: FAIL because the job does not exist.

- [ ] **Step 3: Implement the analysis job**

Create an Inngest function with id `analyze-brand-training-asset`, retries `2`, and event `brand.training.analyze`. Ask `gpt-4o-mini` for JSON matching:

```ts
const proposalSchema = z.object({
  trainingCategory: z.enum(BRAND_TRAINING_CATEGORIES),
  usageMode: z.enum(BRAND_TRAINING_USAGE_MODES),
  analysis: brandTrainingAnalysisSchema,
});
```

The system instruction must state that category and mode are proposals and must not claim approval. Parse with `proposalSchema.parse(JSON.parse(content))`, then call `recordTrainingAnalysis`, which changes the state to `pending_approval`.

- [ ] **Step 4: Register the job**

Import `brandTrainingAnalyzeJob` in `app/src/app/api/inngest/route.ts` and add it once to `functions`.

- [ ] **Step 5: Write failing review-route tests**

Assert PATCH validates the body, profile ownership, reviewer identity, and scoped repository call:

```ts
expect(reviewTrainingReference).toHaveBeenCalledWith(
  { workspaceId: "workspace-1", clientProfileId: "profile-1", referenceId: "ref-1" },
  expect.objectContaining({ reviewStatus: "approved", reviewedByUserId: "user-1" }),
);
```

Assert 404 when the scoped update returns `null`, and 400 when approval has `analysis: null`.

- [ ] **Step 6: Implement the review route**

Use `reviewTrainingAssetSchema.safeParse(await request.json())`. Obtain both `{ user, workspace }` from `requireWorkspaceAccess`; call `getClientProfile` before updating. For `usageMode: "exact"`, load the bound workspace asset by key and return `invalidInput` unless `metadata.hasAlpha === true`. Return the reviewed reference or `clientProfileNotFound`/`invalidInput` through existing API helpers.

- [ ] **Step 7: Run job and route tests**

Run: `cd app && npm test -- src/server/jobs/brand-training.test.ts 'src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.test.ts'`

Expected: PASS.

- [ ] **Step 8: Commit analysis and review**

```bash
git add app/src/server/jobs/brand-training.ts app/src/server/jobs/brand-training.test.ts app/src/app/api/inngest/route.ts 'app/src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.ts' 'app/src/app/api/client-profiles/[id]/training-assets/[referenceId]/route.test.ts'
git commit -m "feat: review AI-analyzed brand assets"
```

---

### Task 5: Add the approved-assets UI to Brand Training

**Files:**
- Modify: `app/src/lib/hooks/use-brand-training.ts`
- Create: `app/src/components/brand-training/BrandTrainingAssets.tsx`
- Create: `app/src/components/brand-training/BrandTrainingAssets.test.tsx`
- Modify: `app/src/components/brand-training/BrandTrainingWizard.tsx`
- Modify: `app/src/components/brand-training/BrandTrainingWizard.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Interfaces:**
- Consumes: GET/POST/PATCH APIs from Tasks 3-4.
- Produces: `useBrandTrainingAssets`, `useUploadBrandTrainingAsset`, `useReviewBrandTrainingAsset`, and `BrandTrainingAssets`.

- [ ] **Step 1: Write the failing component test**

```tsx
it("shows analysis and requires explicit approval", async () => {
  render(<BrandTrainingAssets clientProfileId="profile-1" />, { wrapper: createWrapper() });

  expect(await screen.findByText("Ondas verdes")).toBeVisible();
  expect(screen.getByText("Aguardando aprovação")).toBeVisible();
  expect(screen.getByRole("button", { name: "Aprovar material" })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveValue("graphic");
  expect(screen.getByRole("combobox", { name: "Modo de uso" })).toHaveValue("reference");
});
```

Add tests for `pending_analysis`, `approved`, `archived`, empty state, upload failure, and keyboard-accessible labels.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `cd app && npm test -- src/components/brand-training/BrandTrainingAssets.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add hooks with stable query keys**

Use:

```ts
const brandTrainingAssetsKey = (clientProfileId: string) => [
  "brand-training-assets",
  clientProfileId,
] as const;
```

POST multipart field `file`; PATCH the reviewed category, mode, analysis, and status. On success invalidate both `brandTrainingAssetsKey(clientProfileId)` and `["brand-training-status", clientProfileId]`.

- [ ] **Step 4: Implement `BrandTrainingAssets`**

Render four explicit groups, not user-created categories. Pending analysis is read-only with `role="status"`. Pending approval renders editable category/mode selects and analysis fields. Approved cards show category, mode, reviewer time, and archive action. Exact mode shows a blocking validation message when server metadata reports `hasAlpha: false`.

Use native file input:

```tsx
<input
  id="brand-training-files"
  type="file"
  accept="image/png,image/jpeg,image/webp,image/svg+xml"
  multiple
  onChange={(event) => uploadFiles(event.target.files)}
/>
```

- [ ] **Step 5: Replace the old transient curation surface**

In `BrandTrainingWizard.tsx`, keep profile, ingest, Brand Kit validation, and voice. Replace `CurateStep` with:

```tsx
<BrandTrainingAssets clientProfileId={clientProfileId} />
```

Do not delete legacy reference APIs; campaigns still consume them.

- [ ] **Step 6: Add Portuguese and English copy**

Add exact labels for the four categories, three usage modes, four review states, upload action, analysis explanation, approve/archive actions, transparent-background requirement, and errors under `brandTraining.assets` in both message files.

- [ ] **Step 7: Run UI tests and lint changed files**

Run: `cd app && npm test -- src/components/brand-training/BrandTrainingAssets.test.tsx src/components/brand-training/BrandTrainingWizard.test.tsx && npx eslint src/components/brand-training/BrandTrainingAssets.tsx src/components/brand-training/BrandTrainingWizard.tsx src/lib/hooks/use-brand-training.ts`

Expected: tests PASS and ESLint exits 0.

- [ ] **Step 8: Commit the Brand Training UI**

```bash
git add app/src/lib/hooks/use-brand-training.ts app/src/components/brand-training/BrandTrainingAssets.tsx app/src/components/brand-training/BrandTrainingAssets.test.tsx app/src/components/brand-training/BrandTrainingWizard.tsx app/src/components/brand-training/BrandTrainingWizard.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: add approved visual assets to brand training"
```

---

### Task 6: Make readiness depend on approved training evidence and verify release

**Files:**
- Modify: `app/src/server/brand-profile/trained-status.ts`
- Modify: `app/src/server/brand-profile/trained-status.test.ts`
- Modify: `app/src/app/api/client-profiles/[id]/training-status/route.ts`
- Modify: `app/src/app/api/client-profiles/[id]/training-status/route.test.ts`

**Interfaces:**
- Consumes: approved training rows from Task 2.
- Produces: a readiness response where pending or archived assets never satisfy visual training.

- [ ] **Step 1: Write the failing readiness regression**

```ts
it("ignores unapproved training references", () => {
  const status = resolveBrandProfileStatus(
    { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
    [
      { kind: "style", reviewStatus: "pending_approval" },
      { kind: "style", reviewStatus: "archived" },
    ],
  );

  expect(status).toEqual({ trained: false, missing: ["visual-signal"] });
});

it("accepts an approved trained visual reference", () => {
  const status = resolveBrandProfileStatus(
    { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
    [{ kind: "style", trainingCategory: "visual_reference", reviewStatus: "approved" }],
  );

  expect(status).toEqual({ trained: true, missing: [] });
});

it("accepts an approved trained logo without legacy logoAssetKey", () => {
  const status = resolveBrandProfileStatus(
    { logoAssetKey: null, brandColors: ["#000"], brandFonts: ["Inter"] },
    [{ kind: "other", trainingCategory: "logo", reviewStatus: "approved" }],
  );

  expect(status).toEqual({ trained: true, missing: [] });
});
```

- [ ] **Step 2: Run readiness tests and verify failure**

Run: `cd app && npm test -- src/server/brand-profile/trained-status.test.ts`

Expected: the pending-reference test FAILS under the legacy `kind === "style"` rule.

- [ ] **Step 3: Implement backward-compatible readiness**

Extend `BrandProfileReferenceInput` with nullable `trainingCategory` and `reviewStatus`. A style reference satisfies readiness when it is legacy (`reviewStatus === null || reviewStatus === undefined`) or explicitly approved. An approved trained `visual_reference`, `graphic`, or `character` also satisfies the visual signal. An approved trained `logo` satisfies the logo requirement even when legacy `logoAssetKey` is null. Pending and archived trained rows satisfy neither requirement.

Update the route mapping to pass `trainingCategory: r.trainingCategory` and `reviewStatus: r.reviewStatus` without casts.

- [ ] **Step 4: Run the complete focused suite**

Run:

```bash
cd app
npm test -- src/server/brand-training src/server/repositories/client-reference.test.ts src/server/jobs/brand-training.test.ts 'src/app/api/client-profiles/[id]/training-assets' src/components/brand-training src/server/brand-profile/trained-status.test.ts 'src/app/api/client-profiles/[id]/training-status/route.test.ts'
npm run typecheck
npm run build
npx drizzle-kit check
```

Expected: all tests PASS, typecheck/build exit 0, and Drizzle reports a valid migration history.

- [ ] **Step 5: Confirm scope and isolation manually**

Run the app and verify:

1. Brand A cannot list or review Brand B assets.
2. A newly uploaded asset stays unavailable while analysis or approval is pending.
3. Correcting category/mode before approval persists after reload.
4. Archiving removes the asset from approved results.
5. No campaign row is created or modified.

- [ ] **Step 6: Commit readiness and release checks**

```bash
git add app/src/server/brand-profile/trained-status.ts app/src/server/brand-profile/trained-status.test.ts 'app/src/app/api/client-profiles/[id]/training-status/route.ts' 'app/src/app/api/client-profiles/[id]/training-status/route.test.ts'
git commit -m "test: gate brand readiness on approved assets"
```
