# Arte Livre Temporary References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Let Arte Livre attach, classify, correct, prioritize, and optionally promote up to three piece-specific image references while keeping the provider cap at four images and the price at 50 credits per output.

**Architecture:** Extend `creative_work_sources` with one nullable, versioned JSONB contract. Classification rides on the existing content-analysis call, prepare freezes the resolved treatment, the existing reference planner enforces priority, and the existing exact-asset compositor handles temporary logos/seals. The browser renders one compact source strip and the existing creative-work routes own creation and mutations.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Drizzle/PostgreSQL, TanStack Query, Vitest/Testing Library, Inngest, Sharp, OpenAI Responses/Image APIs.

**Spec:** `docs/superpowers/specs/2026-08-27-arte-livre-referencias-temporarias-design.md`

## Global Constraints

- Scope is `toolKind === "single"` only. Variations, Restyle, and Format Adaptation retain their current source behavior.
- `MAX_PIECE_REFERENCES = 3` is a product limit; `MAX_REFERENCE_IMAGES = 4` remains the provider limit.
- Exact logo/seal references count toward three attachments but never enter the provider image array.
- Keep `GENERATION_CREDIT_COSTS.creativeWorkOutput` unchanged at 50.
- Derive treatment from category; never accept a treatment string from the browser.
- Low-confidence automatic classification is not ready until the user selects a category.
- Do not add a table, dependency, provider call, pricing branch, manual placement editor, or persistent attachment library.
- Preserve old rows and snapshots without `pieceReference` and keep their current behavior.
- Every route mutation must remain workspace-scoped and draft-only.

## File Map

| Area | Files | Responsibility |
| --- | --- | --- |
| Domain | `app/src/server/creative-work/piece-reference.ts`, `piece-reference.test.ts` | Categories, treatments, validation, readiness, provider priority, exact-asset adapter |
| Persistence | `app/src/server/db/schema.ts`, `app/src/server/repositories/creative-work.ts`, `app/drizzle/0089_creative_work_piece_reference.sql`, `app/drizzle/meta/_journal.json` | Nullable JSONB source metadata and scoped writes |
| Analysis | `app/src/server/ai/image-analysis.ts`, `app/src/server/application/analyze-creative-work-source.ts`, corresponding tests | Return category/confidence in the existing content-analysis call |
| API | `app/src/app/api/creative-work/route.ts`, `app/src/app/api/creative-work/[id]/route.ts`, corresponding tests | Initial source, three-source limit, replacement, correction, instruction, promotion |
| Snapshot | `app/src/server/creative-work/contracts.ts`, `app/src/server/application/prepare-creative-work.ts`, `prepare-creative-work.test.ts` | Freeze category, treatment, instruction, alpha and asset identity |
| Provider plan | `app/src/server/creative-work/reference-plan.ts`, `prompt.ts`, `brand-cortex-release.ts`, `app/src/server/ai/creative-qa.ts`, tests | Required/visual ordering and role-bound prompt instructions |
| Generation | `app/src/server/jobs/creative-work.ts`, `creative-work.test.ts` | Merge exact temporary assets into preflight/composition, never provider refs |
| Client/UI | `app/src/lib/hooks/use-creative-work.ts`, `app/src/components/creative-work/useCreativeComposer.ts`, `CreativeComposer.tsx`, `PieceReferenceStrip.tsx`, tests, `app/messages/{pt-BR,en}.json` | Compact accessible strip, cap, correction, instruction, promotion |

## Task 1: Add the versioned domain contract and JSONB persistence

**Interfaces**

- Produces `PieceReferenceDraft`, `FrozenPieceReference`, `pieceReferenceTreatment()`, and `isPieceReferenceReady()`.
- `creative_work_sources.pieceReference` is nullable so legacy sources remain unchanged.
- Consumed later by analysis, route, prepare, planner, job, and UI DTOs.

**Files:**

- Create: `app/src/server/creative-work/piece-reference.ts`
- Create: `app/src/server/creative-work/piece-reference.test.ts`
- Modify: `app/src/server/db/schema.ts:2640-2672`
- Modify: `app/src/server/repositories/creative-work.ts:357-470`
- Create: `app/drizzle/0089_creative_work_piece_reference.sql`
- Modify: `app/drizzle/meta/_journal.json`
- Test: `app/src/server/repositories/creative-work.test.ts`

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from "vitest";
import {
  isPieceReferenceReady,
  pieceReferenceTreatment,
  pieceReferenceDraftSchema,
} from "./piece-reference";

describe("piece reference contract", () => {
  it.each([
    ["person_or_character", "identity_preservation"],
    ["product_or_packaging", "recognizable_preservation"],
    ["additional_logo_or_seal", "exact_application"],
    ["required_object_or_scene", "required_presence"],
    ["graphic_or_texture", "visual_language"],
    ["style_reference", "style_direction"],
  ] as const)("maps %s to %s", (category, treatment) => {
    expect(pieceReferenceTreatment(category)).toBe(treatment);
  });

  it("requires a user choice after low-confidence automation", () => {
    expect(isPieceReferenceReady({
      version: 1,
      category: "product_or_packaging",
      classificationSource: "automatic",
      confidence: "low",
      userInstruction: null,
      hasTransparency: false,
    })).toBe(false);
  });

  it("accepts the same category once explicitly chosen", () => {
    expect(isPieceReferenceReady({
      version: 1,
      category: "product_or_packaging",
      classificationSource: "user",
      confidence: "low",
      userInstruction: null,
      hasTransparency: false,
    })).toBe(true);
  });

  it("blocks exact application without usable transparency", () => {
    expect(isPieceReferenceReady({
      version: 1,
      category: "additional_logo_or_seal",
      classificationSource: "user",
      confidence: "high",
      userInstruction: null,
      hasTransparency: false,
    })).toBe(false);
  });

  it("rejects instructions longer than 240 characters", () => {
    expect(pieceReferenceDraftSchema.safeParse({
      version: 1,
      category: "style_reference",
      classificationSource: "user",
      confidence: "high",
      userInstruction: "x".repeat(241),
      hasTransparency: false,
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module does not exist**

Run: `cd app && npm test -- src/server/creative-work/piece-reference.test.ts`

Expected: FAIL with `Cannot find module './piece-reference'`.

- [ ] **Step 3: Implement the smallest pure contract**

```ts
import { z } from "zod";

export const MAX_PIECE_REFERENCES = 3;
export const PIECE_REFERENCE_CATEGORIES = [
  "person_or_character",
  "product_or_packaging",
  "additional_logo_or_seal",
  "required_object_or_scene",
  "graphic_or_texture",
  "style_reference",
] as const;

export const PIECE_REFERENCE_TREATMENTS = [
  "identity_preservation",
  "recognizable_preservation",
  "exact_application",
  "required_presence",
  "visual_language",
  "style_direction",
] as const;

export const pieceReferenceDraftSchema = z.object({
  version: z.literal(1),
  category: z.enum(PIECE_REFERENCE_CATEGORIES).nullable(),
  classificationSource: z.enum(["automatic", "user"]),
  confidence: z.enum(["high", "medium", "low"]),
  userInstruction: z.string().trim().max(240).nullable(),
  hasTransparency: z.boolean(),
});

export type PieceReferenceDraft = z.infer<typeof pieceReferenceDraftSchema>;
export type PieceReferenceCategory = NonNullable<PieceReferenceDraft["category"]>;
export type PieceReferenceTreatment = (typeof PIECE_REFERENCE_TREATMENTS)[number];

const TREATMENT_BY_CATEGORY: Record<PieceReferenceCategory, PieceReferenceTreatment> = {
  person_or_character: "identity_preservation",
  product_or_packaging: "recognizable_preservation",
  additional_logo_or_seal: "exact_application",
  required_object_or_scene: "required_presence",
  graphic_or_texture: "visual_language",
  style_reference: "style_direction",
};

export const pieceReferenceTreatment = (category: PieceReferenceCategory) =>
  TREATMENT_BY_CATEGORY[category];

export const isPieceReferenceReady = (reference: PieceReferenceDraft | null) =>
  Boolean(reference?.category) &&
  (reference?.classificationSource === "user" || reference?.confidence !== "low") &&
  (reference?.category !== "additional_logo_or_seal" || reference.hasTransparency);
```

- [ ] **Step 4: Add persistence and repository support**

Add to `creativeWorkSources`:

```ts
pieceReference: jsonb("piece_reference").$type<
  import("../creative-work/piece-reference").PieceReferenceDraft
>(),
```

Add `pieceReference` to `CreateCreativeWorkSourceInput` and `CreativeWorkSourcePatch`. The repository must not parse browser input; parsing happens at the route boundary.

Migration:

```sql
ALTER TABLE "adscale_app"."creative_work_sources"
  ADD COLUMN IF NOT EXISTS "piece_reference" jsonb;
```

Append journal entry `idx: 89`, tag `0089_creative_work_piece_reference`, with `when: 1787817600000`.

- [ ] **Step 5: Add a repository test that creates and updates the JSON block without changing a legacy null row**

Assert both the scoped update and `pieceReference === null` on a source created without the field.

- [ ] **Step 6: Run focused tests**

Run: `cd app && npm test -- src/server/creative-work/piece-reference.test.ts src/server/repositories/creative-work.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/creative-work/piece-reference.ts app/src/server/creative-work/piece-reference.test.ts app/src/server/db/schema.ts app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts app/drizzle/0089_creative_work_piece_reference.sql app/drizzle/meta/_journal.json
git commit -m "feat: add piece reference contract"
```

## Task 2: Piggyback classification on the existing analysis call

**Interfaces**

- Consumes `PieceReferenceCategory` and `PieceReferenceDraft` from Task 1.
- Produces optional `pieceReference` classification in `analyzeImageContent` only when requested by Arte Livre.
- Persists `hasTransparency` from the normalization already performed by `analyzeCreativeWorkSource`.

**Files:**

- Modify: `app/src/server/ai/image-analysis.ts:6-98`
- Modify: `app/src/server/application/analyze-creative-work-source.ts:27-112`
- Test: `app/src/server/application/analyze-creative-work-source.test.ts`

- [ ] **Step 1: Add failing application tests**

Test these cases with the existing mocks:

1. A `single` work calls `analyzeImageContent` once with `{ classifyPieceReference: true }` and persists automatic category, confidence, and normalized transparency.
2. A non-single work leaves `pieceReference` null and calls the analyzer without classification.
3. A malformed/missing classification becomes `{ category: null, confidence: "low" }` instead of failing the whole content analysis.

Use a mocked result shaped like:

```ts
{
  product: "Garrafa",
  offer: "",
  cta: { text: "", style: "" },
  brandElements: [],
  keyVisual: "garrafa azul",
  textContent: { headline: "", bullets: [] },
  format: "4:5",
  pieceReference: {
    category: "product_or_packaging",
    confidence: "high",
  },
}
```

- [ ] **Step 2: Run and confirm the new assertions fail**

Run: `cd app && npm test -- src/server/application/analyze-creative-work-source.test.ts`

Expected: FAIL because the analyzer has no classification option and the source patch has no metadata.

- [ ] **Step 3: Extend the same JSON response, not the number of calls**

Add an optional nested schema to `contentBriefSchema`:

```ts
pieceReference: z.object({
  category: z.enum(PIECE_REFERENCE_CATEGORIES).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
}).optional(),
```

Change the function signature to:

```ts
export async function analyzeImageContent(
  imageBuffer: Buffer,
  mimeType: string,
  options: { classifyPieceReference?: boolean } = {},
): Promise<ContentBrief>
```

When the option is true, append the six allowed categories and confidence rule to `CONTENT_SYSTEM_PROMPT`. Do not call `responses.create` a second time.

Extend the existing E2E-controlled return with one deterministic high-confidence classification only when the option is enabled, so controlled tests do not invent another provider path.

- [ ] **Step 4: Extract classification before persisting content facts**

In `analyzeCreativeWorkSource`, pass the option only for `aggregate.work.toolKind === "single"`. Destructure `pieceReference` out before `normalizeContentBrief` so it is not duplicated into the factual content snapshot. Persist:

```ts
pieceReference: aggregate.work.toolKind === "single"
  ? {
      version: 1,
      category: classified?.category ?? null,
      classificationSource: "automatic",
      confidence: classified?.confidence ?? "low",
      userInstruction: source.pieceReference?.userInstruction ?? null,
      hasTransparency: normalized.hasTransparency,
    }
  : source.pieceReference,
```

Keep template sources and other protocols on their current path.

- [ ] **Step 5: Run the test**

Run: `cd app && npm test -- src/server/application/analyze-creative-work-source.test.ts`

Expected: PASS and existing call-count assertions remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/ai/image-analysis.ts app/src/server/application/analyze-creative-work-source.ts app/src/server/application/analyze-creative-work-source.test.ts
git commit -m "feat: classify Arte Livre references during analysis"
```

## Task 3: Enforce the three-reference limit and allow safe corrections

**Interfaces**

- Browser sends only `category` and optional `userInstruction` for correction.
- Route derives `classificationSource: "user"`; it never accepts treatment, confidence, alpha, workspace, or profile from the browser.
- Server enforces the limit before creating or uploading another creative-work source claim.

**Files:**

- Modify: `app/src/app/api/creative-work/[id]/route.ts:165-187,615-688`
- Test: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/app/api/creative-work/route.ts:89-169`
- Test: `app/src/app/api/creative-work/route.test.ts`
- Modify: `app/src/server/repositories/creative-work.ts:170-248,431-470`
- Test: `app/src/server/repositories/creative-work.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts:151-168,542-557`
- Test: `app/src/lib/hooks/use-creative-work.test.tsx`

- [ ] **Step 1: Write failing route tests**

Add tests that prove:

- the fourth asset-backed source on a `single` draft returns `409` with `creativeWorkPieceReferenceLimit` and never calls `createCreativeWorkSource`;
- a legacy/template source does not consume one of the three temporary image slots;
- other protocols retain their existing source behavior;
- a new asset-backed single attachment is stored with `usage: "both"` and `usageConfirmed: true`;
- the first asset-backed attachment created atomically with a new single draft receives the same `both`/confirmed semantics and still dispatches analysis;
- `updatePieceReference` accepts a category plus trimmed instruction of at most 240 characters;
- `replacePieceReference` swaps the asset on the same source, keeps the instruction, resets analysis/classification, and dispatches analysis again even when three slots are occupied;
- extra fields such as `treatment`, `hasTransparency`, or `classificationSource` make the strict schema return `400`;
- correction is rejected for another workspace, a missing source, a non-single work, or a non-draft work.

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `cd app && npm test -- src/app/api/creative-work/route.test.ts 'src/app/api/creative-work/[id]/route.test.ts'`

Expected: FAIL because the limit/error/action do not exist.

- [ ] **Step 3: Add the strict action schema and scoped mutation**

```ts
const updatePieceReferenceSchema = z.object({
  action: z.literal("updatePieceReference"),
  sourceId: z.string().uuid(),
  category: z.enum(PIECE_REFERENCE_CATEGORIES),
  userInstruction: z.string().trim().max(240).nullable(),
}).strict();

const replacePieceReferenceSchema = z.object({
  action: z.literal("replacePieceReference"),
  sourceId: z.string().uuid(),
  assetId: z.string().uuid(),
}).strict();
```

In the source branch, require `toolKind === "single"`, `source.status === "ready"`, and an existing `pieceReference`; preserve `confidence` and `hasTransparency`, and write:

```ts
pieceReference: {
  ...source.pieceReference,
  version: 1,
  category: parsed.data.category,
  classificationSource: "user",
  userInstruction: parsed.data.userInstruction?.trim() || null,
}
```

Clear `brief`, `copy`, and `inputSnapshot` after correction, matching source-analysis edits.

For replacement, validate the new workspace-scoped image asset, then update the same source with the new `assetId`, null content/style analysis, `status: "uploaded"`, and an automatic low-confidence `pieceReference` that preserves only the old `userInstruction`. Add `assetId` to `CreativeWorkSourcePatch`, dispatch the existing source-analysis event, and keep the source count unchanged.

- [ ] **Step 4: Enforce the product cap at the route boundary**

Before `createCreativeWorkSource`, if `toolKind === "single"`, the new source is asset-backed, and `aggregate.sources.filter((source) => source.assetId).length >= MAX_PIECE_REFERENCES`, return `apiError("creativeWorkPieceReferenceLimit", 409)`. Force new asset-backed single sources to `usage: "both"` and `usageConfirmed: true`; ignore the caller's legacy usage selector for those images. Template sources keep their current semantics and do not consume a temporary-image slot.

Apply the same normalization inside `createCreativeWorkDraftWithSource` when the first source created atomically with a draft is asset-backed, including its conflict comparison. The POST route keeps its existing dispatch path; add its regression test so this entry point cannot drift from later attachments.

- [ ] **Step 5: Expose the DTO and mutation type**

Add `pieceReference: PieceReferenceDraft | null` to `CreativeWorkSource`, and add:

```ts
| {
    action: "updatePieceReference";
    sourceId: string;
    category: PieceReferenceCategory;
    userInstruction: string | null;
  }
| { action: "replacePieceReference"; sourceId: string; assetId: string }
```

Add the PT-BR and English API error keys in Task 8 with the rest of the UI copy.

- [ ] **Step 6: Run focused tests**

Run: `cd app && npm test -- src/app/api/creative-work/route.test.ts 'src/app/api/creative-work/[id]/route.test.ts' src/server/repositories/creative-work.test.ts src/lib/hooks/use-creative-work.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/app/api/creative-work/route.ts app/src/app/api/creative-work/route.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts app/src/lib/hooks/use-creative-work.ts app/src/lib/hooks/use-creative-work.test.tsx
git commit -m "feat: manage Arte Livre reference metadata"
```

## Task 4: Freeze readiness and treatment in the prepare snapshot

**Interfaces**

- Consumes ready source metadata and asset details.
- Produces `FrozenPieceReference` inside each applicable `CreativeWorkInputSnapshot.sources[]` entry.
- `prepareCreativeWork` remains the last unpaid gate.

**Files:**

- Modify: `app/src/server/creative-work/piece-reference.ts`
- Modify: `app/src/server/creative-work/contracts.ts:228-261`
- Modify: `app/src/server/application/prepare-creative-work.ts:111-143,243-263`
- Test: `app/src/server/application/prepare-creative-work.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts:560-572`

- [ ] **Step 1: Write failing prepare tests**

Cover:

- high/medium automatic classifications prepare successfully;
- low automatic confidence and null category return `piece_reference_required`;
- a failed asset-backed single source returns `sources_not_ready` until it is retried or removed;
- a user-corrected low-confidence source prepares successfully;
- exact category without transparency returns `piece_reference_exact_incompatible`;
- snapshot freezes category, derived treatment, instruction, alpha, key, MIME, and label;
- changing the draft source after prepare does not mutate the persisted snapshot object;
- legacy source without metadata retains the old `usageConfirmed` behavior.

- [ ] **Step 2: Run and confirm failure**

Run: `cd app && npm test -- src/server/application/prepare-creative-work.test.ts`

Expected: FAIL on missing readiness and snapshot fields.

- [ ] **Step 3: Define the frozen shape**

```ts
export interface FrozenPieceReference {
  version: 1;
  category: PieceReferenceCategory;
  treatment: PieceReferenceTreatment;
  userInstruction: string | null;
  hasTransparency: boolean;
}
```

Add `pieceReference?: FrozenPieceReference` to snapshot source entries. Use optional, not nullable, so pre-feature snapshots stay naturally readable.

- [ ] **Step 4: Replace only the single-tool readiness gate**

For asset-backed `single` sources, treat `failed` analysis as not ready. For sources with `pieceReference`, reject exact application without transparency first so the route can return the specific incompatibility error, then require `isPieceReferenceReady()`. Preserve the existing `usageConfirmed` guard only for legacy sources without the new block.

Map both new prepare errors to `422`; use distinct public keys so UI can say “choose a type” versus “replace or reclassify this logo”.

- [ ] **Step 5: Freeze via the pure mapper**

```ts
pieceReference: source.pieceReference?.category
  ? {
      version: 1,
      category: source.pieceReference.category,
      treatment: pieceReferenceTreatment(source.pieceReference.category),
      userInstruction: source.pieceReference.userInstruction,
      hasTransparency: source.pieceReference.hasTransparency,
    }
  : undefined,
```

- [ ] **Step 6: Run focused tests**

Run: `cd app && npm test -- src/server/application/prepare-creative-work.test.ts 'src/app/api/creative-work/[id]/route.test.ts'`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/server/creative-work/piece-reference.ts app/src/server/creative-work/contracts.ts app/src/server/application/prepare-creative-work.ts app/src/server/application/prepare-creative-work.test.ts 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: freeze Arte Livre reference treatments"
```

## Task 5: Extend provider reference planning and prompt roles

**Interfaces**

- Consumes frozen piece references.
- Produces ordered provider slots: revision/original, required piece, visual piece, then brand identity.
- Exact application produces no provider slot.

**Files:**

- Modify: `app/src/server/creative-work/reference-plan.ts:41-194`
- Test: `app/src/server/creative-work/reference-plan.test.ts`
- Modify: `app/src/server/creative-work/prompt.ts:445-470`
- Test: `app/src/server/creative-work/prompt.test.ts`
- Modify: `app/src/server/creative-work/brand-cortex-release.ts:129`
- Modify: `app/src/server/ai/creative-qa.ts:478-611`
- Test: `app/src/server/ai/creative-qa.test.ts`

- [ ] **Step 1: Write failing planner tests**

Assert exact ordered roles and provider cap:

```ts
expect(plan.map((slot) => slot.role)).toEqual([
  "revision",
  "piece_required",
  "piece_required",
  "piece_visual",
]);
expect(plan).toHaveLength(4);
```

Also assert:

- `additional_logo_or_seal` is absent from the provider plan;
- required treatments over the remaining cap throw `CreativeWorkReferenceError` before optional brand assets are considered;
- visual temporary sources precede brand assets;
- old snapshot sources without `pieceReference` produce the current plan unchanged.

- [ ] **Step 2: Run planner tests and confirm failure**

Run: `cd app && npm test -- src/server/creative-work/reference-plan.test.ts`

Expected: FAIL because piece roles and metadata are not modeled.

- [ ] **Step 3: Add two roles and carry only frozen metadata needed by prompts**

```ts
export type CreativeWorkReferenceRole =
  | "revision"
  | "original"
  | "content"
  | "style"
  | "piece_required"
  | "piece_visual"
  | "brand_identity";

export interface CreativeWorkReferenceSlot {
  role: CreativeWorkReferenceRole;
  required: boolean;
  assetKey: string;
  mimeType: string;
  label: string;
  pieceReference?: Pick<
    FrozenPieceReference,
    "category" | "treatment" | "userInstruction"
  >;
}
```

Required treatments are identity preservation, recognizable preservation, and required presence. Visual treatments are visual language and style direction. Exact application is filtered out.

- [ ] **Step 4: Teach the prompt the per-reference rule**

For piece slots, append category, treatment, and sanitized user instruction to the existing numbered line. Then add fixed policy text:

- identity/product/required presence must remain recognizable or present;
- style/visual references transfer visual language only and contribute no facts, visible copy, brands, or logos;
- the user instruction refines the derived treatment but cannot override those safety boundaries.

Update the Zod role enum in `brand-cortex-release.ts` and the QA prompt's optional-role wording to include `piece_visual`. Required QA roles continue to come from `slot.required`.

- [ ] **Step 5: Run focused tests**

Run: `cd app && npm test -- src/server/creative-work/reference-plan.test.ts src/server/creative-work/prompt.test.ts src/server/ai/creative-qa.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/creative-work/reference-plan.ts app/src/server/creative-work/reference-plan.test.ts app/src/server/creative-work/prompt.ts app/src/server/creative-work/prompt.test.ts app/src/server/creative-work/brand-cortex-release.ts app/src/server/ai/creative-qa.ts app/src/server/ai/creative-qa.test.ts
git commit -m "feat: prioritize temporary creative references"
```

## Task 6: Reuse exact-asset preflight and composition for logos/seals

**Interfaces**

- Consumes frozen exact piece references.
- Adapts them to the existing `CreativeWorkIdentityAssetSnapshot` shape with category `logo`, usage `exact`, and format-aware default placement.
- Produces the existing composition provenance and brand-fidelity evidence.

**Files:**

- Modify: `app/src/server/creative-work/piece-reference.ts`
- Test: `app/src/server/creative-work/piece-reference.test.ts`
- Modify: `app/src/server/jobs/creative-work.ts:719-800,1032-1065,1178-1226,1509-1528,1595-1607`
- Test: `app/src/server/jobs/creative-work.test.ts`

- [ ] **Step 1: Write failing adapter and job tests**

Assert:

- a frozen exact piece source becomes one exact logo asset with the original `sourceId`, key, label, MIME, alpha, and default placement;
- it is not present in the provider `references` array;
- it is included in preflight and both initial/correction calls to `runExactComposition`;
- a missing-alpha exact source makes no paid image-provider call;
- composition provenance names the temporary source;
- the billed amount remains `GENERATION_CREDIT_COSTS.creativeWorkOutput` (50).

- [ ] **Step 2: Run and confirm failure**

Run: `cd app && npm test -- src/server/creative-work/piece-reference.test.ts src/server/jobs/creative-work.test.ts`

Expected: FAIL because exact temporary sources are not adapted or composed.

- [ ] **Step 3: Add the narrow adapter**

```ts
export function exactPieceReferenceAssets(
  sources: readonly CreativeWorkInputSnapshot["sources"][number][],
  format: string,
): CreativeWorkIdentityAssetSnapshot[] {
  const policy = policyForExactAsset("logo", format);
  return sources.flatMap((source) =>
    source.pieceReference?.treatment === "exact_application" &&
    source.assetKey && source.mimeType
      ? [{
          referenceId: source.sourceId,
          assetKey: source.assetKey,
          label: source.label?.trim() || "Logo ou selo adicional",
          category: "logo",
          usageMode: "exact",
          analysis: null,
          mimeType: source.mimeType,
          hasAlpha: source.pieceReference.hasTransparency,
          placement: policy ? {
            gravity: policy.preferredGravity,
            widthRatio: policy.preferredWidthRatio,
          } : null,
        }]
      : [],
  );
}
```

This is an adapter, not a new composition path.

- [ ] **Step 4: Merge once per output and reuse everywhere**

After `targetFormat` is known:

```ts
const executionIdentityAssets = [
  ...identitySnapshot.assets,
  ...exactPieceReferenceAssets(work.inputSnapshot?.sources ?? [], targetFormat),
];
```

Use `executionIdentityAssets` for reserved-placement prompt input, exact preflight, initial composition, correction composition, and deterministic brand fidelity. Keep `identitySnapshot.assets` for Brand Training selection/evidence so temporary sources are not mislabeled as trained assets.

- [ ] **Step 5: Run focused tests**

Run: `cd app && npm test -- src/server/creative-work/piece-reference.test.ts src/server/jobs/creative-work.test.ts`

Expected: PASS, with every provider request still at four references or fewer.

- [ ] **Step 6: Commit**

```bash
git add app/src/server/creative-work/piece-reference.ts app/src/server/creative-work/piece-reference.test.ts app/src/server/jobs/creative-work.ts app/src/server/jobs/creative-work.test.ts
git commit -m "feat: compose exact temporary references"
```

## Task 7: Promote an attachment into existing Brand Training

**Interfaces**

- `promotePieceReference` uses the work's own `clientProfileId`; the browser sends only `sourceId`.
- Reuses the source workspace asset and the existing `client_references` review pipeline.
- Sequential retries are idempotent through `getTrainingReferenceByAssetKey`.

**Files:**

- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Test: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

- promotion reuses the source `assetKey` and work `clientProfileId`;
- an existing training reference is returned without inserting or dispatching again;
- a new reference is created with `pending_analysis` and dispatches `brand.training.analyze` with the stored MIME and transparency;
- dispatch failure deletes only the newly created training reference and returns an action error;
- promotion failure leaves the creative source and draft unchanged;
- missing profile/source/asset, another workspace, non-single work, and source without classification are rejected.

- [ ] **Step 2: Run and confirm failure**

Run: `cd app && npm test -- 'src/app/api/creative-work/[id]/route.test.ts'`

Expected: FAIL because the action is absent.

- [ ] **Step 3: Add the strict action and reuse existing repository/job functions**

```ts
const promotePieceReferenceSchema = z.object({
  action: z.literal("promotePieceReference"),
  sourceId: z.string().uuid(),
}).strict();
```

Within the existing draft/source scope:

1. Resolve the asset through `getWorkspaceAssetById(source.assetId, workspace.id)`.
2. Return `getTrainingReferenceByAssetKey(workspace.id, work.clientProfileId, asset.key)` if present.
3. Otherwise call `createTrainingReference` with the same key and source label.
4. Dispatch `heavyImageEventName("brand.training.analyze")` with `hasAlpha: source.pieceReference.hasTransparency`.
5. If dispatch fails, delete that new training reference; do not delete the workspace asset.

Do not create a second application service for this single route action.

- [ ] **Step 4: Add the hook action and response type**

Return `{ reference, alreadySaved }` and invalidate both the creative-work query and the active profile's training-assets query on success.

- [ ] **Step 5: Run focused tests**

Run: `cd app && npm test -- 'src/app/api/creative-work/[id]/route.test.ts' src/lib/hooks/use-creative-work.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'app/src/app/api/creative-work/[id]/route.ts' 'app/src/app/api/creative-work/[id]/route.test.ts' app/src/lib/hooks/use-creative-work.ts app/src/lib/hooks/use-creative-work.test.tsx
git commit -m "feat: promote piece references to brand training"
```

## Task 8: Build the compact accessible Arte Livre strip

**Interfaces**

- Consumes `CreativeWorkSource.pieceReference` and composer actions.
- Only `CreativeComposer` with `intent === "single"` renders it.
- Replaces the legacy content/style selector for new Arte Livre references; other protocols keep `CreativeSourceChip`.

**Files:**

- Create: `app/src/components/creative-work/PieceReferenceStrip.tsx`
- Create: `app/src/components/creative-work/PieceReferenceStrip.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx:380-438`
- Test: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts:810-851,963-1010,1242-1269,1302-1346`
- Test: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

- [ ] **Step 1: Write failing component and hook tests**

Test the approved behavior:

- `0 de 3 anexos` through `3 de 3 anexos` counts asset-backed sources and is shown only in Arte Livre;
- at three, Add remains visible, disabled, and named `Limite de 3 atingido`;
- selecting four files uploads only the remaining slots and announces the limit;
- upload/analyzing/low-confidence/ready/failed states have text or `aria-live`, not color alone;
- type selector is keyboard-operable and shows all six localized types;
- derived treatment changes immediately when category changes;
- instruction is labeled `Como usar nesta arte?`, trimmed, and capped at 240;
- remove, replace, retry, and save-to-training have explicit accessible names;
- promotion pending/error/success is local to that card;
- low confidence and failed analysis disable generation until correction/retry/removal succeeds;
- legacy/template single sources and Variations, Restyle, and Adaptation still render their existing `CreativeSourceChip` UI.

- [ ] **Step 2: Run and confirm failure**

Run: `cd app && npm test -- src/components/creative-work/PieceReferenceStrip.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/useCreativeComposer.test.tsx`

Expected: FAIL because the strip and actions do not exist.

- [ ] **Step 3: Implement one presentational strip**

Props should stay concrete:

```ts
type PieceReferenceStripProps = {
  sources: CreativeWorkSource[]; // asset-backed Arte Livre sources only
  disabled: boolean;
  uploading: boolean;
  onAdd: (files: FileList | null) => void;
  onUpdate: (
    sourceId: string,
    category: PieceReferenceCategory,
    userInstruction: string | null,
  ) => Promise<boolean>;
  onReplace: (sourceId: string, file: File) => Promise<boolean>;
  onRetry: (sourceId: string) => Promise<void>;
  onRemove: (sourceId: string) => Promise<boolean>;
  onPromote: (sourceId: string) => Promise<void>;
};
```

Use native `<input type="file" multiple accept="image/png,image/jpeg,image/webp">`, `<select>`, `<textarea maxLength={240}>`, and `<button>`. No custom combobox, modal, side panel, drag library, or placement editor.

- [ ] **Step 4: Cap before upload as well as on the server**

In `addFiles`, compute from asset-backed sources only:

```ts
const remaining = intentRef.current === "single"
  ? Math.max(0, MAX_PIECE_REFERENCES - (detailQuery.data?.sources.filter((source) => source.assetId).length ?? 0))
  : images.length;
const accepted = images.slice(0, remaining);
```

Upload `accepted`, not `images`. The route remains authoritative against stale tabs/races.

In `CreativeComposer`, pass asset-backed single sources to `PieceReferenceStrip`; continue rendering `CreativeSourceChip` for template-backed/legacy non-image sources and for every other protocol.

For card replacement, upload the chosen file with `uploadChatAttachment`, then send `replacePieceReference` with the returned `assetId`. Because the route updates the existing source, replacement still works at the three-card limit.

- [ ] **Step 5: Replace the single readiness check**

For sources with `pieceReference`, use `isPieceReferenceReady`. For legacy sources, retain `usageConfirmed`. Do not change Restyle/Variations behavior.

- [ ] **Step 6: Add localized copy**

Under the existing creative-work composer namespace, add PT-BR and English keys for:

- count, limit, add, replace, remove, retry, promote;
- all six category labels and six treatment summaries;
- instruction label/placeholder;
- analyzing, low-confidence choice required, ready, failed;
- promoted, already promoted, promotion failed;
- public API errors for limit, manual category required, and incompatible exact asset.

- [ ] **Step 7: Run focused UI tests**

Run: `cd app && npm test -- src/components/creative-work/PieceReferenceStrip.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/useCreativeComposer.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/creative-work/PieceReferenceStrip.tsx app/src/components/creative-work/PieceReferenceStrip.test.tsx app/src/components/creative-work/CreativeComposer.tsx app/src/components/creative-work/CreativeComposer.test.tsx app/src/components/creative-work/useCreativeComposer.ts app/src/components/creative-work/useCreativeComposer.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: add Arte Livre reference strip"
```

## Task 9: Run contract, integration, build, and graph verification

**Interfaces**

- Verifies the feature end to end without a paid provider call.
- Leaves deploy and live-provider evidence as separate, explicit gates.

**Files:**

- Modify only files needed to fix failures introduced by Tasks 1-8.

- [ ] **Step 1: Run the feature contract suite**

```bash
cd app
npm test -- \
  src/server/creative-work/piece-reference.test.ts \
  src/server/application/analyze-creative-work-source.test.ts \
  src/app/api/creative-work/route.test.ts \
  'src/app/api/creative-work/[id]/route.test.ts' \
  src/server/repositories/creative-work.test.ts \
  src/lib/hooks/use-creative-work.test.tsx \
  src/server/application/prepare-creative-work.test.ts \
  src/server/creative-work/reference-plan.test.ts \
  src/server/creative-work/prompt.test.ts \
  src/server/ai/creative-qa.test.ts \
  src/server/jobs/creative-work.test.ts \
  src/components/creative-work/PieceReferenceStrip.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run static and convergence verification**

Run: `cd app && npm run lint && npm run typecheck && npm run convergence:test && PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP=1 npm run convergence:gate`

Expected: PASS with no lint, TypeScript, or frozen-module expansion errors.

- [ ] **Step 3: Run the full local unit suite**

Run: `cd app && npm test`

Expected: PASS. Record the test count; do not conflate skipped/provider tests with passing evidence.

- [ ] **Step 4: Build with the repository's validated CI environment**

Run:

```bash
cd app
env \
  DATABASE_URL=postgres://test:test@localhost:5432/adscale_test \
  BETTER_AUTH_SECRET=01234567890123456789012345678901 \
  BETTER_AUTH_URL=http://localhost:3000 \
  OPENAI_API_KEY=sk-test1234567890123456789012345678901234567890 \
  OPENAI_TEXT_MODEL=gpt-4o \
  OPENAI_IMAGE_MODEL=gpt-image-1 \
  MINIMAX_API_KEY=minimax-test-key-for-ci-build \
  R2_ACCOUNT_ID=test \
  R2_ACCESS_KEY_ID=test \
  R2_SECRET_ACCESS_KEY=test \
  R2_BUCKET=test \
  R2_PUBLIC_BASE_URL=https://test.example.com \
  INNGEST_EVENT_KEY=test \
  INNGEST_SIGNING_KEY=test \
  RESEND_API_KEY=re_test_ci_build_placeholder_key \
  EMAIL_FROM='ADScale <onboarding@example.com>' \
  APP_URL=http://localhost:3000 \
  STRIPE_SECRET_KEY=sk_test_ci_build_placeholder_key \
  STRIPE_WEBHOOK_SECRET=whsec_test_ci_build_placeholder \
  STRIPE_STARTER_PRICE_ID=price_starter \
  STRIPE_GROWTH_PRICE_ID=price_growth \
  STRIPE_SCALE_PRICE_ID=price_scale \
  STRIPE_SUCCESS_URL='http://localhost:3000/settings?tab=billing&checkout=success' \
  STRIPE_CANCEL_URL='http://localhost:3000/settings?tab=plans&checkout=cancel' \
  npm run build
```

Expected: PASS. If environment validation blocks it, report that gate separately rather than weakening validation.

- [ ] **Step 5: Confirm the two economic invariants by test and source**

Verify `MAX_REFERENCE_IMAGES === 4` and `GENERATION_CREDIT_COSTS.creativeWorkOutput === 50`; do not change either constant.

- [ ] **Step 6: Update the project graph after code changes**

Run: `graphify update .`

Expected: graph update completes; dirty `graphify-out/` output is allowed and should be staged only if repository policy expects generated graph changes for the implementation branch.

- [ ] **Step 7: Inspect the final diff and commit any verification-only fixes**

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no whitespace errors, no unrelated files staged, no `16`-slot UI copy, no variable-credit logic, and no second classification call.

If a fix is required, return to its owning task, rerun that task's focused test, and use that task's explicit `git add` list. Do not broadly stage the worktree.

## Completion Evidence

Implementation is complete only when all of the following are independently reported:

- focused feature tests;
- full local tests;
- typecheck;
- build;
- provider-reference cap assertion;
- fixed 50-credit assertion;
- no paid provider call was needed for local verification;
- deploy/live-provider evidence remains unclaimed unless separately authorized and executed;
- human visual approval of the compact strip remains a separate acceptance gate.
