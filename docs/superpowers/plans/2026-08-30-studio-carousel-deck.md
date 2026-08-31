# Studio Carousel Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `Criar carrossel` protocol to the Studio that turns free-form content into an editable, grounded 5–8-slide deck, generates one coherent visual system through an automatic anchor trio, and supports slide-level revisions, approval, and ordered export.

**Architecture:** Keep `creative_work` as the owning aggregate and add only the missing ordered-deck semantics: a versioned carousel draft in `settings`, a frozen deck/visual contract in `inputSnapshot`, and a dedicated slide-version table. Reuse the current fact pack, Brand Cortex identity snapshot, canonical image executor, exact-asset compositor, billing ledger, Inngest runtime, object storage, analytics, and progressive Studio controller. A carousel never enters `creative_work_outputs`; its slides are generated in a dependent chain (cover → middle → closing → shared anchor board → remaining slides), with one settlement per actual slide dispatch.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query, Zod, Drizzle/PostgreSQL, OpenAI structured text responses already used by the repository, canonical image generation, Sharp, JSZip, Inngest, Vitest/Testing Library, Playwright, and the existing controlled E2E provider.

**Spec:** `docs/superpowers/specs/2026-08-30-studio-carousel-deck-design.md`

## Prerequisite

Execute `docs/superpowers/plans/2026-08-30-progressive-studio-flow.md` through its progressive-plan UI and accepted-generation tasks before Task 8 here. Tasks 1–7 below are server/domain work and may be completed first, but the carousel UI must reuse the progressive Studio entry, explicit objective selection, `preparePlan()` / `confirmGeneration()` split, Studio session analytics, and deterministic workspace rollout. Do not create a parallel carousel landing page, intent router, confirmation controller, analytics session, or rollout framework.

## Global Constraints

- `carousel` is a Creative Work protocol/`toolKind`, never a format and never a `creative_work_output` plan.
- A deck has exactly 5–8 current slides. Position 1 is `hook`; there is at most one `cta`; positions and stable slide IDs are unique.
- V1 formats are `4:5` (default) and `1:1`. Reject `9:16` for carousel drafts, prepare, generation, revision, and export.
- The Córtex da Marca is the identity baseline. Accept at most one temporary visual reference, and use it only for composition, texture, and climate; it never contributes factual authority.
- The image provider generates text-free visual bases. ADScale composes the approved copy and exact brand assets deterministically afterward. When no approved font asset exists, use Pango's `sans` fallback and persist `authority: "fallback"`; do not add a font package or binary asset.
- The user confirms once with `Gerar carrossel`. There is no cost screen, per-operation price, anchor approval, financial approval, or pause between the trio and remaining slides. Enter never triggers generation.
- Before the first dispatch, check that the workspace can spend the full planned deck amount. Debit only when each slide is actually dispatched; an anchor failure leaves undispatched slides uncharged.
- Subjective visual review is advisory. It never fails a slide, silently retries, or spends credits. Only objective integrity failures block a slide.
- Retry and revision never overwrite an older slide version. Copy-only edits reuse the frozen provider base and do not call the image provider.
- Preserve `creative_work_outputs`, existing links, old works, current selection semantics, campaigns, social-post behavior, and all unrelated WIP.
- Add no dependency, service, generic multi-page engine, canvas editor, caption generator, social publisher, or user-template system.
- Use the existing progressive Studio rollout bucket. Add only one carousel percentage, default `0`; do not deploy, raise rollout, run a paid provider, or execute the nine-deck human gate without separate explicit authorization.
- Every HTTP boundary revalidates workspace, work, profile, slide, source, asset, and revision ownership. Never trust IDs or deck content returned by the browser.
- Stage only files named by the active task. Never use `git add .`, `git add -A`, reset, clean, or broad restore.
- After source edits, run `graphify update .` before the task commit. Do not stage unrelated graph output.

## File Structure

| File | Responsibility |
| --- | --- |
| `app/src/server/creative-work/carousel-contracts.ts` | Versioned deck, draft, slide, visual-contract, QA, manifest schemas, anchor positions, and carousel quote. |
| `app/src/server/creative-work/carousel-editorial.ts` | Structured editorial proposal, blocking questions, tracked changes, deterministic lint, and one advisory anti-slop review. |
| `app/src/server/creative-work/carousel-visual.ts` | Deterministic rhythm/layout contract, canonical hash, anchor board, contact sheet, and set-level advisory review. |
| `app/src/server/repositories/creative-work-carousel.ts` | Slide-version persistence, CAS transitions, lineage, current-position queries, approval, and aggregate status. |
| `app/src/server/application/plan-carousel-work.ts` | Load grounded context, ask only blocking questions, persist the editable carousel draft. |
| `app/src/server/application/prepare-carousel-work.ts` | Validate the draft, freeze fact pack/identity/visual contract, and persist the prepared revision without billing or image dispatch. |
| `app/src/server/application/generate-carousel-work.ts` | Full-deck balance preflight, idempotent slide materialization, and first-anchor settlement. |
| `app/src/server/application/advance-carousel-generation.ts` | Deterministic cover/middle/closing chain, anchor-board creation, remaining dispatch, and final set QA. |
| `app/src/server/application/revise-carousel.ts` | Copy-only, visual, reorder, and global-direction descendants without overwriting prior versions. |
| `app/src/server/application/export-carousel-work.ts` | Approval checks, manifest construction, individual download, and ordered ZIP materialization. |
| `app/src/server/jobs/creative-work-carousel.ts` | One slide provider call, exact composition, deterministic copy composition, objective QA, completion/failure, and chain continuation. |
| `app/src/components/creative-work/useCarouselComposer.ts` | Carousel-specific server state and wizard actions; no duplicate entry or protocol controller. |
| `app/src/components/creative-work/CarouselComposer.tsx` | Dedicated carousel wizard shell routed from `CreativeComposer`. |
| `app/src/components/creative-work/CarouselSequenceBoard.tsx` | All-slide sequence, selection, native drag/drop, and keyboard reorder alternative. |
| `app/src/components/creative-work/CarouselSlideEditor.tsx` | Per-slide copy, role, before/after reason, accept/reject/edit, and revision actions. |
| `app/src/components/creative-work/CarouselVisualSummary.tsx` | Frozen palette, type authority, motifs, layouts, restrictions, and temporary-reference scope. |
| `app/src/components/creative-work/CarouselDeckReview.tsx` | Generation states, current versions, contact-sheet warnings, approval, download, and ZIP export. |

## Execution Map

```text
Task 1 contracts + grounding
  └─ Task 2 schema + repository
       └─ Task 3 editorial planner + plan endpoint
            └─ Task 4 visual contract + prepare
                 └─ Task 5 billing + generation coordinator
                      └─ Task 6 slide job + composition + QA
                           └─ Task 7 revisions + approval + export
                                └─ Task 8 client controller
                                     └─ Task 9 wizard UI
                                          └─ Task 10 rollout + E2E + release evidence
```

---

### Task 1: Define the carousel contract and grounded-copy boundary

**Files:**

- Create: `app/src/server/creative-work/carousel-contracts.ts`
- Create: `app/src/server/creative-work/carousel-contracts.test.ts`
- Modify: `app/src/server/creative-work/contracts.ts`
- Modify: `app/src/server/creative-work/contracts.test.ts`
- Modify: `app/src/server/creative-work/fact-pack.ts`
- Modify: `app/src/server/creative-work/fact-pack.test.ts`
- Modify: `app/src/server/creative-work/protocol.ts`
- Modify: `app/src/server/creative-work/protocol.test.ts`
- Modify: `app/src/server/creative-work/prepared-plan.ts`
- Modify: `app/src/server/creative-work/prepared-plan.test.ts`

**Interfaces:**

- Consumes: `CreativeWorkFactPack`, `CreativeWorkIdentitySnapshot`, `CreativeWorkFormat`, `canonicalJsonStringify()`, and `GENERATION_CREDIT_COSTS.creativeWorkOutput`.
- Produces: every persisted/API type used by later tasks plus `carouselAnchorPositions()`, `carouselLayoutFamilyForRole()`, `quoteCarouselDeck()`, `validateCarouselDeckStructure()`, `resolveCarouselPreparedSnapshot()`, and `validateTextFieldsAgainstFactPack()`.

Use these exact public contracts:

```ts
export const CAROUSEL_NARRATIVE_ROLES = [
  "hook", "context", "problem", "argument", "evidence",
  "method", "bridge", "closing", "cta",
] as const;
export const CAROUSEL_LAYOUT_FAMILIES = ["impact", "development", "respite"] as const;
export const CAROUSEL_SLIDE_STATUSES = ["draft", "queued", "processing", "completed", "failed"] as const;

export type CarouselNarrativeRole = (typeof CAROUSEL_NARRATIVE_ROLES)[number];
export type CarouselLayoutFamily = (typeof CAROUSEL_LAYOUT_FAMILIES)[number];
export type CarouselCopyAuthority = "user_input" | "ai_proposal" | "human_edit";

export function carouselLayoutFamilyForRole(role: CarouselNarrativeRole): CarouselLayoutFamily {
  if (role === "hook" || role === "problem" || role === "cta") return "impact";
  if (role === "bridge" || role === "closing") return "respite";
  return "development";
}

export type CarouselSlidePlanV1 = {
  slideId: string;
  position: number;
  role: CarouselNarrativeRole;
  purpose: string;
  primaryText: string;
  secondaryText: string | null;
  authority: CarouselCopyAuthority;
  sourceFactIds: string[];
  layoutFamily: CarouselLayoutFamily;
};

export type CarouselDeckPlanV1 = {
  version: 1;
  revision: string;
  workId: string;
  objective: string;
  audience: string | null;
  tone: string | null;
  promise: string;
  format: "4:5" | "1:1";
  slides: CarouselSlidePlanV1[];
};

export type CarouselBlockingQuestionV1 = {
  id: string;
  field: "objective" | "fact" | "offer" | "cta" | "brand_conflict";
  question: string;
  reason: string;
};

export type CarouselEditorialChangeV1 = {
  id: string;
  slideId: string | null;
  field: "position" | "role" | "purpose" | "primaryText" | "secondaryText";
  before: string | number | null;
  after: string | number | null;
  reason: string;
  status: "pending" | "accepted" | "rejected" | "superseded";
};

export type CarouselDraftStateV1 = {
  version: 1;
  revision: string;
  answers: Record<string, string>;
  blockingQuestions: CarouselBlockingQuestionV1[];
  plan: CarouselDeckPlanV1 | null;
  changes: CarouselEditorialChangeV1[];
};
```

Define the visual and prepared envelopes exactly once in the same file:

```ts
export type CarouselTextRegion = {
  x: number; y: number; width: number; height: number;
  minFontPx: number; maxFontPx: number;
  align: "left" | "center" | "right";
};

export type CarouselLayoutPlan = {
  id: string;
  density: "high" | "medium" | "low";
  primaryRegion: CarouselTextRegion;
  secondaryRegion: CarouselTextRegion | null;
  exactAssetSlots: Array<{
    assetKey: string; x: number; y: number; width: number; height: number;
  }>;
  backgroundInstruction: string;
};

export type CarouselVisualContractV1 = {
  version: 1;
  brandSnapshotHash: string;
  temporaryReferenceId: string | null;
  palette: string[];
  typography: {
    fontAssetKey: string | null;
    fallbackFamily: "sans" | null;
    authority: "approved" | "fallback";
  };
  directionInstruction: string | null;
  layoutFamilies: Record<CarouselLayoutFamily, CarouselLayoutPlan>;
  recurringMotifs: string[];
  exactAssetKeys: string[];
  prohibitedElements: string[];
  safeAreaPx: number;
  contractHash: string;
};

export type CarouselDeckQualityV1 = {
  version: 1;
  objectivePassed: boolean;
  advisoryWarnings: string[];
  contactSheetKey: string | null;
  reviewedAt: string | null;
};

export type CarouselPreparedSnapshotV1 = {
  version: 1;
  preparedRevision: string;
  deck: CarouselDeckPlanV1;
  visualContract: CarouselVisualContractV1;
};
```

Extend the existing envelopes additively:

```ts
export const CREATIVE_WORK_INTENTS = [
  "social_post", "variations", "single", "format_adaptation", "restyle", "carousel",
] as const;

export type CreativeWorkSettings = {
  // existing fields stay unchanged
  carouselDraft?: CarouselDraftStateV1;
};

export type CreativeWorkInputSnapshot = {
  // existing fields stay unchanged
  carousel?: CarouselPreparedSnapshotV1;
};
```

Generalize the existing fact validator without changing its public wrapper:

```ts
export type GroundedTextField = { field: string; text: string };
export type TextClaimViolation = { class: CreativeFactClass; value: string; field: string };

export function validateTextFieldsAgainstFactPack(
  fields: readonly GroundedTextField[],
  factPack: CreativeWorkFactPack,
): TextClaimViolation[];

export function validateSocialPostCopyAgainstFactPack(
  copy: Pick<SocialPostCopy, "headline" | "body" | "cta">,
  factPack: CreativeWorkFactPack,
): CopyClaimViolation[] {
  return validateTextFieldsAgainstFactPack([
    { field: "headline", text: copy.headline },
    { field: "body", text: copy.body },
    { field: "cta", text: copy.cta },
  ], factPack) as CopyClaimViolation[];
}
```

- [ ] **Step 1: Write failing carousel-schema tests**

Cover a valid five-slide deck, valid eight-slide deck, 4/9 slide rejection, duplicate positions, duplicate IDs, non-hook first slide, duplicate CTA, blank copy, invalid `9:16`, the exact role→family table, stable anchor positions for counts 5–8, and legacy snapshots resolving `null`.

```ts
it.each([
  [5, [1, 3, 5]],
  [6, [1, 3, 6]],
  [7, [1, 4, 7]],
  [8, [1, 4, 8]],
])("selects cover, ceil-middle and closing for %i slides", (count, expected) => {
  expect(carouselAnchorPositions(count)).toEqual(expected);
});
```

- [ ] **Step 2: Write failing grounding regression tests**

```ts
it("reports the exact carousel slide field that invented a claim", () => {
  expect(validateTextFieldsAgainstFactPack([
    { field: "slides.2.primaryText", text: "50% de desconto em setembro" },
  ], pack)).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: "slides.2.primaryText", value: "50%" }),
    expect.objectContaining({ field: "slides.2.primaryText", value: "setembro" }),
  ]));
});
```

- [ ] **Step 3: Run the red tests**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-contracts.test.ts \
  src/server/creative-work/contracts.test.ts \
  src/server/creative-work/fact-pack.test.ts \
  src/server/creative-work/protocol.test.ts \
  src/server/creative-work/prepared-plan.test.ts
```

Expected: FAIL because the carousel module, intent, and generic fact validator do not exist.

- [ ] **Step 4: Implement the schemas and pure helpers**

Use strict Zod objects. `quoteCarouselDeck(slideCount)` returns `{unitCount, credits}` using `GENERATION_CREDIT_COSTS.creativeWorkOutput`. `carouselAnchorPositions()` throws outside 5–8. `validateCarouselDeckStructure()` returns concrete `{path, code, message}` findings rather than a quality score.

Prevent accidental legacy output planning:

```ts
if (input.intent === "carousel") {
  throw new Error("carousel_requires_deck_quote");
}
```

Add that guard to both `quoteCreativeWork()` and `resolveCreativeWorkProtocol()`; carousel generation will use the dedicated deck path from Task 5.

Extend `PreparedPlanProjectionV1` as a discriminated union instead of teaching the legacy projector to treat carousel like Restyle. The carousel variant keeps the same safe projection shape, uses `protocol:"carousel"`, returns one optional style material, maps every frozen slide to an output label (`Tela 1`…`Tela 8`), and takes `preparedRevision` only from `inputSnapshot.carousel`. Return `null` until that frozen snapshot exists. This lets the prerequisite `preparePlan()` / `confirmGeneration()` controller remain the single confirmation path without exposing the raw snapshot.

Rename the current object type to `LegacyPreparedPlanProjectionV1`, then add:

```ts
type LegacyProtocol = Exclude<CreativeWorkIntent, "social_post" | "carousel">;

export type CarouselPreparedPlanProjectionV1 = {
  version: 1;
  workId: string;
  preparedRevision: string;
  protocol: "carousel";
  materials: LegacyPreparedPlanProjectionV1["materials"];
  preserve: Preserve[];
  explore: Explore[];
  outputs: Array<{
    label: string;
    targetFormat: "4:5" | "1:1";
    directionId: null;
  }>;
  outputCount: number;
  formats: Array<"4:5" | "1:1">;
};

export type PreparedPlanProjectionV1 =
  | LegacyPreparedPlanProjectionV1
  | CarouselPreparedPlanProjectionV1;
```

The carousel branch returns `preserve:["verified_facts","brand_requirements"]`, `explore:["composition","hierarchy","visual_language"]`, and projects only frozen source labels/categories—never answers, copy, fact values, storage keys, or visual-contract internals.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-contracts.test.ts \
  src/server/creative-work/contracts.test.ts \
  src/server/creative-work/fact-pack.test.ts \
  src/server/creative-work/protocol.test.ts \
  src/server/creative-work/prepared-plan.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/creative-work/carousel-contracts.ts \
  app/src/server/creative-work/carousel-contracts.test.ts \
  app/src/server/creative-work/contracts.ts \
  app/src/server/creative-work/contracts.test.ts \
  app/src/server/creative-work/fact-pack.ts \
  app/src/server/creative-work/fact-pack.test.ts \
  app/src/server/creative-work/protocol.ts \
  app/src/server/creative-work/protocol.test.ts \
  app/src/server/creative-work/prepared-plan.ts \
  app/src/server/creative-work/prepared-plan.test.ts
git commit -m "feat: define carousel deck contracts"
```

---

### Task 2: Add slide-version persistence without changing existing outputs

**Files:**

- Modify: `app/src/server/db/schema.ts`
- Create: `app/drizzle/0090_creative_work_carousels.sql`
- Modify: `app/drizzle/meta/_journal.json`
- Create or modify as generated by Drizzle: `app/drizzle/meta/0038_snapshot.json`
- Create: `app/src/server/repositories/creative-work-carousel.ts`
- Create: `app/src/server/repositories/creative-work-carousel.test.ts`
- Create: `app/tests/integration/carousel-migration.test.ts`

**Interfaces:**

- Consumes: Task 1 schemas and the existing `creativeWorkItems` ownership columns/locks.
- Produces: `creativeWorkCarouselSlides` plus the only repository functions allowed to mutate slide versions.

Add these server-owned columns to `creative_work_items`:

```ts
carouselApprovedRevision: text("carousel_approved_revision"),
carouselQuality: jsonb("carousel_quality").$type<CarouselDeckQualityV1 | null>(),
```

Add `creative_work_carousel_slides` with these columns:

```ts
id, workspaceId, workItemId, lineageId, parentSlideId, versionNumber,
deckRevision, position, role, primaryText, secondaryText, copyAuthority,
sourceFactIds, layoutFamily, status, providerBaseKey, outputKey, previewKey,
visualContractHash, anchorKey, generationOperationKey, errorCode, quality,
isCurrent, createdAt, queuedAt, terminalAt, updatedAt
```

The migration must:

```sql
ALTER TABLE "adscale_app"."creative_work_items"
  DROP CONSTRAINT "creative_work_items_tool_kind_check";
ALTER TABLE "adscale_app"."creative_work_items"
  ADD CONSTRAINT "creative_work_items_tool_kind_check"
  CHECK ("tool_kind" IN ('social_post','variations','single','format_adaptation','restyle','carousel'));
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN "carousel_approved_revision" text,
  ADD COLUMN "carousel_quality" jsonb;
```

Create partial unique indexes for one current version per lineage and position, a unique `(work_item_id, lineage_id, version_number)`, and a unique `(work_item_id, generation_operation_key)`. Add status, role, layout-family, positive version/position, and parent self-FK checks. Do not alter `creative_work_outputs`.

Export exactly these repository commands:

```ts
export async function listCurrentCarouselSlides(
  workspaceId: string,
  workItemId: string,
  executor?: Pick<typeof db, "select">,
): Promise<CreativeWorkCarouselSlide[]>;

export async function getCreativeWorkCarouselAggregate(
  workspaceId: string,
  workItemId: string,
): Promise<({
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
  sources: CreativeWorkSource[];
  carouselSlides: CreativeWorkCarouselSlide[];
}) | null>;

export async function materializeCarouselSlides(input: {
  workspaceId: string;
  workItemId: string;
  deck: CarouselDeckPlanV1;
  visualContractHash: string;
}): Promise<CreativeWorkCarouselSlide[]>;

export async function queueCarouselSlide(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  anchorKey: string | null;
  operationKey: string;
}): Promise<CreativeWorkCarouselSlide | null>;

export async function markCarouselSlideProcessing(input: {
  workspaceId: string; workItemId: string; slideId: string;
}): Promise<CreativeWorkCarouselSlide | null>;

export async function completeCarouselSlide(input: {
  workspaceId: string; workItemId: string; slideId: string;
  providerBaseKey: string; outputKey: string; previewKey: string | null;
  quality: Record<string, unknown>;
}): Promise<CreativeWorkCarouselSlide | null>;

export async function failCarouselSlide(input: {
  workspaceId: string; workItemId: string; slideId: string; errorCode: string;
}): Promise<CreativeWorkCarouselSlide | null>;

export async function setRemainingCarouselAnchorKey(input: {
  workspaceId: string; workItemId: string; slideIds: string[]; anchorKey: string;
}): Promise<CreativeWorkCarouselSlide[]>;

export async function createCarouselSlideDescendant(input: {
  workspaceId: string; workItemId: string; parentSlideId: string;
  deckRevision: string; position: number; role: CarouselNarrativeRole;
  primaryText: string; secondaryText: string | null;
  copyAuthority: CarouselCopyAuthority; sourceFactIds: string[];
  layoutFamily: CarouselLayoutFamily; visualContractHash: string;
  generationOperationKey: string; status: "draft" | "completed";
  providerBaseKey: string | null; outputKey: string | null; previewKey: string | null;
}): Promise<CreativeWorkCarouselSlide | null>;

export async function refreshCarouselWorkStatus(input: {
  workspaceId: string; workItemId: string;
}): Promise<CreativeWorkItem | null>;

export async function approveCarouselDeckRevision(input: {
  workspaceId: string; workItemId: string; deckRevision: string;
}): Promise<CreativeWorkItem | null>;
```

- [ ] **Step 1: Write the migration and repository tests first**

The disposable PostgreSQL test must apply `0090_creative_work_carousels.sql`, insert an existing `single` work and a new `carousel` work, and prove the old work is unchanged. It must reject two current versions for one position, duplicate operation keys, invalid statuses, and a slide whose work belongs to another workspace.

```ts
it("keeps one current slide per position while preserving the parent", async () => {
  const first = await materializeCarouselSlides(fixture);
  const child = await createCarouselSlideDescendant({
    workspaceId, workItemId, parentSlideId: first[0].id,
    deckRevision: "deck-r2", primaryText: "Novo gancho",
    secondaryText: null, copyAuthority: "human_edit",
    layoutFamily: "impact", generationOperationKey: "slide-1-r2",
  });
  expect(child?.parentSlideId).toBe(first[0].id);
  expect((await listCurrentCarouselSlides(workspaceId, workItemId))[0].id).toBe(child?.id);
});
```

- [ ] **Step 2: Run red tests**

```bash
cd app
npm test -- \
  src/server/repositories/creative-work-carousel.test.ts \
  src/server/repositories/creative-work.test.ts \
  tests/integration/carousel-migration.test.ts
```

Expected: FAIL because the table, migration, and repository do not exist.

- [ ] **Step 3: Add schema and generate the migration metadata**

Implement the table in `schema.ts`, then run:

```bash
cd app
npm run db:generate
```

If Drizzle assigns a filename or snapshot number different from `0090` / `0038` because another migration landed first, keep the generated next number and update every command/path in this plan before continuing. Never hand-edit a generated snapshot to force a number.

- [ ] **Step 4: Implement repository CAS transitions**

Use a transaction plus the existing per-work advisory-lock pattern. `materializeCarouselSlides()` inserts `draft` rows idempotently from the frozen deck. `queueCarouselSlide()` changes only `draft|failed → queued`; `completeCarouselSlide()` changes only `processing → completed`; late completions return `null`. `createCarouselSlideDescendant()` flips the previous row to `isCurrent=false` and inserts the child in one transaction.

`refreshCarouselWorkStatus()` derives only from current carousel slides:

```ts
if (slides.some((slide) => slide.status === "queued" || slide.status === "processing")) return "generating";
if (slides.length === 0) return "ready";
if (slides.every((slide) => slide.status === "completed")) return "completed";
if (slides.every((slide) => slide.status === "failed")) return "failed";
return "partial";
```

- [ ] **Step 5: Compose a carousel aggregate without widening the existing repository**

Implement `getCreativeWorkCarouselAggregate()` in the new repository by reusing `getCreativeWork()` and appending `listCurrentCarouselSlides()` only when `work.toolKind === "carousel"`. Do not change `getCreativeWork()` or any existing caller. Add a regression asserting the inherited `outputs` array is returned byte-for-byte unchanged and a non-carousel work receives `carouselSlides:[]`.

- [ ] **Step 6: Run tests and typecheck**

```bash
cd app
npm test -- \
  src/server/repositories/creative-work-carousel.test.ts \
  tests/integration/carousel-migration.test.ts
npm run typecheck
```

Expected: PASS. The DB integration case may be skipped only when `TEST_DATABASE_URL` is absent; record that distinction in the task report.

- [ ] **Step 7: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/db/schema.ts \
  app/drizzle/0090_creative_work_carousels.sql \
  app/drizzle/meta/_journal.json \
  app/drizzle/meta/0038_snapshot.json \
  app/src/server/repositories/creative-work-carousel.ts \
  app/src/server/repositories/creative-work-carousel.test.ts \
  app/tests/integration/carousel-migration.test.ts
git commit -m "feat: persist carousel slide versions"
```

---

### Task 3: Plan grounded copy and expose blocking questions

**Files:**

- Create: `app/src/server/creative-work/carousel-editorial.ts`
- Create: `app/src/server/creative-work/carousel-editorial.test.ts`
- Create: `app/src/server/application/plan-carousel-work.ts`
- Create: `app/src/server/application/plan-carousel-work.test.ts`
- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/server/repositories/creative-work.test.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/plan/route.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/plan/route.test.ts`
- Modify: `app/src/app/api/creative-work/route.ts`
- Modify: `app/src/app/api/creative-work/route.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`

**Interfaces:**

- Consumes: `CarouselDraftStateV1`, `CarouselDeckPlanV1`, `buildCreativeWorkFactPack()`, `validateTextFieldsAgainstFactPack()`, `getCreativeWorkCarouselAggregate()`, `updateCreativeWorkDraftIfUnchanged()`, and the existing AI rate limiter.
- Produces: `lintCarouselDeck()`, `proposeCarouselDraft()`, and `planCarouselWork()` plus `POST /api/creative-work/:id/carousel/plan`.

Use concrete findings, never one aggregate score:

```ts
export type CarouselEditorialFinding = {
  code:
    | "slide_count"
    | "missing_hook"
    | "duplicate_idea"
    | "broken_transition"
    | "unresolved_promise"
    | "forced_cta"
    | "text_density"
    | "generic_phrase"
    | "blase_tone"
    | "unsupported_claim";
  path: string;
  message: string;
  blocking: boolean;
};

export function lintCarouselDeck(input: {
  deck: CarouselDeckPlanV1;
  factPack: CreativeWorkFactPack;
}): CarouselEditorialFinding[];

export async function proposeCarouselDraft(input: {
  workId: string;
  request: string;
  answers: Record<string, string>;
  previous: CarouselDraftStateV1 | null;
  factPack: CreativeWorkFactPack;
  toneOfVoice: string | null;
}): Promise<CarouselDraftStateV1>;
```

The structured model response is a discriminated union:

```ts
const carouselPlannerResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("questions"),
    questions: z.array(carouselBlockingQuestionSchema).min(1).max(3),
  }).strict(),
  z.object({
    kind: z.literal("deck"),
    objective: z.string().trim().min(1).max(240),
    audience: z.string().trim().max(240).nullable(),
    tone: z.string().trim().max(240).nullable(),
    promise: z.string().trim().min(1).max(320),
    slides: z.array(carouselSlideProposalSchema).min(5).max(8),
    changes: z.array(carouselEditorialChangeProposalSchema).max(40),
  }).strict(),
]);
```

The system prompt must include these exact product rules:

```text
Write in natural pt-BR. One main idea per slide. Use 5 to 8 slides because the arc needs them, never to fill a quota.
You may cut, condense, reorder, split, merge and rewrite. Explain every change in the changes array.
Never invent a price, number, date, offer, benefit, proof, condition, credential, modality, guarantee, brand, product or service.
If a missing fact prevents a safe deck, return only concrete blocking questions. Unknown stays unknown.
Reject generic phrases that could belong to any brand, inflated claims, empty motivational language, AI meta-language and a blase tone.
The first slide is hook. CTA is optional and never forced.
```

- [ ] **Step 1: Write failing pure editorial tests**

Cover repeated normalized primary text, hook promise never resolved, primary+secondary density above the selected region budget, a forced CTA with no CTA in request/facts, unsupported numbers/entities, a generic phrase fixture, and a grounded concise deck with no blocking findings.

```ts
it("keeps human text authoritative when a later proposal arrives", async () => {
  const previous = draftWithHumanSlide("slide-2", "Texto humano aprovado");
  const next = await proposeCarouselDraft({ ...input, previous });
  expect(next.plan?.slides.find((slide) => slide.slideId === "slide-2")).toMatchObject({
    primaryText: "Texto humano aprovado",
    authority: "human_edit",
  });
});
```

- [ ] **Step 2: Write failing application and route tests**

Assert: wrong workspace is 404; non-carousel is 409; non-draft is 409; pending source analysis is 409; stale `expectedUpdatedAt` is 409; at most one style reference is accepted; a question response persists `blockingQuestions` with `plan:null`; an answered response persists a 5–8 slide plan; no billing, Inngest, or image provider mock is called.

Request body:

```ts
const bodySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  answers: z.record(z.string().min(1), z.string().trim().min(1).max(1_000)).default({}),
}).strict();
```

- [ ] **Step 3: Run red tests**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-editorial.test.ts \
  src/server/application/plan-carousel-work.test.ts \
  'src/app/api/creative-work/[id]/carousel/plan/route.test.ts' \
  src/app/api/creative-work/route.test.ts \
  'src/app/api/creative-work/[id]/route.test.ts'
```

Expected: FAIL because planning and carousel HTTP actions do not exist.

- [ ] **Step 4: Implement one structured planning call and deterministic fallback**

Use `zodResponseFormat()` and `env.OPENAI_TEXT_MODEL`. Under `isE2EControlledProviderEnabled()`, return a deterministic five-slide plan derived only from `factPack.request` and facts. Do not silently fall back in production when the model response is invalid: return `editorial_plan_invalid` and keep the last persisted draft.

Stable IDs must derive from work + semantic position, not random model output:

```ts
function stableSlideId(workId: string, position: number): string {
  const hex = createHash("sha256").update(`${workId}:carousel:${position}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
```

- [ ] **Step 5: Implement `planCarouselWork()` under the existing prepare lock**

Build the fact pack with mode `social_post`. Include only `content|both` sources as factual sources. Pass a `style` source only as visual context metadata, never into the fact pack. Merge answers into the authoritative request context, call `proposeCarouselDraft()`, run structural/grounding lint, and persist `settings.carouselDraft` with CAS. Return the persisted `work`, `draft`, and findings.

- [ ] **Step 6: Add the plan route and source cap**

Rate-limit the route with category `ai`. In `createCreativeWorkDraftWithSource()`, `autosaveCreativeWorkDraft()`, and `createCreativeWorkSource()`, reuse the existing per-work source lock: reread `toolKind`, allow at most one non-failed carousel source, force its usage to `style`, and return `carousel_reference_limit` before upload-analysis dispatch. Map it to `creativeWorkCarouselReferenceLimit`. A route-only count is insufficient because two uploads can race. Extend the existing PATCH autosave schema through `creativeWorkSettingsSchema`; do not add another generic draft endpoint.

In the existing detail GET, keep `getCreativeWork()` as the base aggregate and call `listCurrentCarouselSlides()` only for `toolKind === "carousel"`. Project each slide by omitting `providerBaseKey`, `outputKey`, `previewKey`, `anchorKey`, and `generationOperationKey`, then add `hasOutput:Boolean(outputKey)`. Destructure `carouselQuality` before spreading the work DTO; expose only `{version,objectivePassed,advisoryWarnings,reviewedAt,hasContactSheet:Boolean(contactSheetKey)}`. Non-carousel works return `carouselSlides:[]` and `carouselQuality:null`. Add exact route assertions for both cases so private keys cannot leak through a future object spread.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-editorial.test.ts \
  src/server/application/plan-carousel-work.test.ts \
  src/server/repositories/creative-work.test.ts \
  'src/app/api/creative-work/[id]/carousel/plan/route.test.ts' \
  src/app/api/creative-work/route.test.ts \
  'src/app/api/creative-work/[id]/route.test.ts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/creative-work/carousel-editorial.ts \
  app/src/server/creative-work/carousel-editorial.test.ts \
  app/src/server/application/plan-carousel-work.ts \
  app/src/server/application/plan-carousel-work.test.ts \
  app/src/server/repositories/creative-work.ts \
  app/src/server/repositories/creative-work.test.ts \
  'app/src/app/api/creative-work/[id]/carousel/plan/route.ts' \
  'app/src/app/api/creative-work/[id]/carousel/plan/route.test.ts' \
  app/src/app/api/creative-work/route.ts \
  app/src/app/api/creative-work/route.test.ts \
  'app/src/app/api/creative-work/[id]/route.ts' \
  'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: plan grounded carousel copy"
```

---

### Task 4: Freeze the rhythm system during prepare

**Files:**

- Create: `app/src/server/creative-work/carousel-visual.ts`
- Create: `app/src/server/creative-work/carousel-visual.test.ts`
- Create: `app/src/server/application/prepare-carousel-work.ts`
- Create: `app/src/server/application/prepare-carousel-work.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`
- Modify: `app/src/server/creative-work/identity.ts`
- Modify: `app/src/server/creative-work/identity.test.ts`

**Interfaces:**

- Consumes: approved deck/draft, fact pack, Brand Cortex identity snapshot, approved brand fonts, exact assets, optional style reference, and existing draft CAS.
- Produces: `buildCarouselVisualContract()`, `buildCarouselAnchorBoard()`, `buildCarouselContactSheet()`, `reviewCarouselSet()`, and `prepareCarouselWork()`.

Use these signatures:

```ts
export function buildCarouselVisualContract(input: {
  format: "4:5" | "1:1";
  identity: CreativeWorkIdentitySnapshot;
  temporaryReferenceId: string | null;
  selectedFontAssetKey?: string;
}): CarouselVisualContractV1;

function exactAssetSlotsForCarousel(input: {
  format: "4:5" | "1:1";
  assets: CreativeWorkIdentityAssetSnapshot[];
  safeAreaPx: number;
}): CarouselLayoutPlan["exactAssetSlots"];

export async function buildCarouselAnchorBoard(input: {
  anchors: Array<{ position: number; buffer: Buffer }>;
}): Promise<Buffer>;

export async function buildCarouselContactSheet(input: {
  slides: Array<{ position: number; buffer: Buffer }>;
}): Promise<Buffer>;

export async function reviewCarouselSet(input: {
  contactSheet: Buffer;
  deck: CarouselDeckPlanV1;
  contract: CarouselVisualContractV1;
}): Promise<string[]>;
```

The contract uses three fixed rhythm families. For `4:5` at 1024×1280, freeze these initial regions; for `1:1`, multiply every `y` and `height` by `0.8` and round:

```ts
const layoutFamilies = {
  impact: {
    id: "impact-v1", density: "high",
    primaryRegion: { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" },
    secondaryRegion: { x: 80, y: 920, width: 720, height: 180, minFontPx: 24, maxFontPx: 38, align: "left" },
    exactAssetSlots,
    backgroundInstruction: "Text-free hero composition with one dominant focal area and the lower-right brand-asset reserve left clear.",
  },
  development: {
    id: "development-v1", density: "medium",
    primaryRegion: { x: 72, y: 112, width: 640, height: 300, minFontPx: 34, maxFontPx: 60, align: "left" },
    secondaryRegion: { x: 72, y: 790, width: 880, height: 270, minFontPx: 24, maxFontPx: 38, align: "left" },
    exactAssetSlots,
    backgroundInstruction: "Text-free asymmetric composition with a clear reading path and all declared text and exact-asset regions unobstructed.",
  },
  respite: {
    id: "respite-v1", density: "low",
    primaryRegion: { x: 132, y: 330, width: 760, height: 320, minFontPx: 38, maxFontPx: 68, align: "center" },
    secondaryRegion: { x: 172, y: 720, width: 680, height: 170, minFontPx: 24, maxFontPx: 34, align: "center" },
    exactAssetSlots,
    backgroundInstruction: "Text-free low-density composition with generous negative space around the centered reading area and exact assets.",
  },
} satisfies CarouselVisualContractV1["layoutFamilies"];
```

Inside `buildCarouselVisualContract()`, compute `const exactAssetSlots = exactAssetSlotsForCarousel({format:input.format, assets:input.identity.assets, safeAreaPx})` once from assets whose `usageMode === "exact"` and whose frozen `placement` is non-null. Use a square contain-box whose width is `round(1024 * widthRatio)`; derive `x/y` from the frozen gravity, the canvas height (`1280` or `1024`), and `safeAreaPx`, with center gravity centered. This reuses the approved placement rather than inventing carousel-only positioning policy. Set `directionInstruction:null` on the first contract. Compute `contractHash` over the contract without its own hash using SHA-256 + `canonicalJsonStringify()`.

- [ ] **Step 1: Write failing visual-contract tests**

Assert: same frozen inputs produce the same hash; palette/font/reference change produces a different hash; approved font wins; no approved font records `fallbackFamily:"sans"`; only exact identity assets enter `exactAssetKeys`; 1:1 regions remain in bounds; a temporary reference ID does not appear in fact data; the three layout families have distinct density and geometry.

- [ ] **Step 2: Write failing prepare tests**

Assert: carousel-only; draft-only; no unanswered blocking questions; 5–8 slides; `4:5|1:1` only; every claim grounded; editorial blocking findings return 422 details; one temporary style source freezes as visual-only; Brand Cortex knowledge is included; identity + deck + contract persist with one prepared revision; repeated identical prepare reuses it; a changed copy/order/reference invalidates it; no spend, image executor, or Inngest call occurs.

```ts
expect(result.value.work.inputSnapshot?.carousel).toEqual({
  version: 1,
  preparedRevision: expect.any(String),
  deck: expect.objectContaining({ slides: expect.arrayContaining([]) }),
  visualContract: expect.objectContaining({ contractHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
});
```

- [ ] **Step 3: Run red tests**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-visual.test.ts \
  src/server/application/prepare-carousel-work.test.ts \
  'src/app/api/creative-work/[id]/route.test.ts' \
  src/server/creative-work/identity.test.ts
```

Expected: FAIL because carousel prepare and visual contract do not exist.

- [ ] **Step 4: Implement the visual contract and image-sheet helpers**

Use Sharp only. `buildCarouselAnchorBoard()` sorts by position and produces one horizontal PNG with three equally sized cells. `buildCarouselContactSheet()` produces a two-column PNG with all slides in position order. `reviewCarouselSet()` returns at most five short warnings; under the controlled provider it returns `[]`. A model failure also returns one `set_review_unavailable` warning and never blocks.

- [ ] **Step 5: Implement `prepareCarouselWork()`**

Run under `withCreativeWorkPreparationLock()`. Rebuild the fact pack from request + content authorities, reject style-only facts, run `lintCarouselDeck()`, validate every `primaryText`/`secondaryText`, create the identity snapshot with published Brand Cortex enabled for carousel, build the visual contract, and write:

```ts
const snapshot: CreativeWorkInputSnapshot = {
  generationPolicyVersion: "quality_recovery_v1",
  factPack,
  request: work.request,
  settings: work.settings,
  sources: frozenSources,
  carousel: { version: 1, preparedRevision, deck, visualContract },
};
```

Persist `inputSnapshot` and `identitySnapshot` while status remains `draft`; generation confirmation owns the `ready → generating` transition. Reuse `updateCreativeWorkDraftIfUnchanged()`.

- [ ] **Step 6: Route existing `action:"prepare"` to the carousel command**

Load the aggregate once. If `toolKind === "carousel"`, call `prepareCarouselWork()`; otherwise keep the current `prepareCreativeWork()` path. Map `blocking_questions`, `editorial_invalid`, `invalid_context`, `stale_input`, and `temporary_reference_limit` to typed 409/422 responses with field findings.

- [ ] **Step 7: Run tests and typecheck**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-visual.test.ts \
  src/server/application/prepare-carousel-work.test.ts \
  'src/app/api/creative-work/[id]/route.test.ts' \
  src/server/creative-work/identity.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/creative-work/carousel-visual.ts \
  app/src/server/creative-work/carousel-visual.test.ts \
  app/src/server/application/prepare-carousel-work.ts \
  app/src/server/application/prepare-carousel-work.test.ts \
  'app/src/app/api/creative-work/[id]/route.ts' \
  'app/src/app/api/creative-work/[id]/route.test.ts' \
  app/src/server/creative-work/identity.ts \
  app/src/server/creative-work/identity.test.ts
git commit -m "feat: prepare carousel visual rhythm"
```

---

### Task 5: Settle only dispatched slides and coordinate the anchor chain

**Files:**

- Create: `app/src/server/application/generate-carousel-work.ts`
- Create: `app/src/server/application/generate-carousel-work.test.ts`
- Create: `app/src/server/application/advance-carousel-generation.ts`
- Create: `app/src/server/application/advance-carousel-generation.test.ts`
- Modify: `app/src/server/generation/settlement-adapters.ts`
- Modify: `app/src/server/generation/settlement-adapters.test.ts`
- Modify: `app/src/server/generation/canonical/types.ts`
- Create: `app/src/server/generation/canonical/types.test.ts`
- Modify: `app/src/server/jobs/heavy-image-events.ts`
- Create: `app/src/server/jobs/heavy-image-events.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/generate/route.test.ts`

**Interfaces:**

- Consumes: prepared carousel snapshot, slide repository, `checkSpend()`, `startGenerationSettlement()`, existing credit unit, Inngest, object storage, and Task 4 anchor/contact helpers.
- Produces: `carouselSlideSettlementAdapter()`, `generateCarouselWork()`, `dispatchNextCarouselStage()`, and event `creative-work.carousel-slide.generate`.

Generation input keeps the prerequisite Studio correlation:

```ts
export type GenerateCarouselWorkInput = {
  workspaceId: string;
  workItemId: string;
  userId: string;
  preparedRevision: string;
  studioSessionId?: string;
  rolloutVariant?: StudioRolloutVariant;
};
```

Add the canonical destination without changing existing values:

```ts
export interface GenerationDestination {
  kind: "derivation" | "creative_work_output" | "creative_work_carousel_slide";
  // existing fields unchanged
}
```

Define the event and billing key once:

```ts
export const CAROUSEL_SLIDE_GENERATE_EVENT = "creative-work.carousel-slide.generate";

export function carouselSlideBillingKey(workItemId: string, slideId: string) {
  return `creative-work:${workItemId}:carousel-slide:${slideId}:generate`;
}
```

Settlement adapter contract:

```ts
export function carouselSlideSettlementAdapter(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  userId: string;
  anchorKey: string | null;
  operationKey: string;
}): GenerationSettlementAdapter<{
  slide: CreativeWorkCarouselSlide;
}>;
```

- [ ] **Step 1: Write failing settlement tests**

Prove: first claimant queues and charges one unit; replay joins the same row without a second charge; dispatch event ID is stable; dispatch failure marks only that slide and refunds only its key; a pre-provider failure settles net zero; completed slide replay does not re-dispatch; a non-anchor cannot queue without `anchorKey`.

- [ ] **Step 2: Write failing generation/coordinator tests**

Cover:

1. full-deck `checkSpend(slideCount * unitCost)` occurs before slide materialization or dispatch;
2. insufficient balance creates no rows and dispatches nothing;
3. materialization is idempotent;
4. only position 1 dispatches initially;
5. after cover completion only the ceil-middle dispatches;
6. after middle only closing dispatches;
7. after all anchors complete one anchor board is stored and every remaining slide receives the same key;
8. remaining slides dispatch in parallel through separate settlements;
9. an anchor objective failure dispatches nothing else;
10. non-anchor failure preserves completed siblings;
11. all current slides terminal refresh the aggregate and trigger set review once.
12. accepted settlement records `generation_confirmed` once with the Studio correlation, while the winning all-completed set-review CAS records one deck-level `output_ready`.

```ts
expect(dispatches.map((event) => event.data.position)).toEqual([1]);
await dispatchNextCarouselStage(scopeAfterCover);
expect(dispatches.map((event) => event.data.position)).toEqual([1, 3]);
```

- [ ] **Step 3: Run red tests**

```bash
cd app
npm test -- \
  src/server/application/generate-carousel-work.test.ts \
  src/server/application/advance-carousel-generation.test.ts \
  src/server/generation/settlement-adapters.test.ts \
  src/server/generation/canonical/types.test.ts \
  src/server/jobs/heavy-image-events.test.ts \
  'src/app/api/creative-work/[id]/generate/route.test.ts'
```

Expected: FAIL because carousel settlement and orchestration do not exist.

- [ ] **Step 4: Implement one-unit settlement**

Use `spend()` with action `image_derivation` and amount `GENERATION_CREDIT_COSTS.creativeWorkOutput`. The adapter reserves by `queueCarouselSlide()`, dispatches one stable Inngest event, records the current queue timestamp, and uses the existing refund ledger with `${billingKey}:dispatch-refund`. Do not add credit reservations or a second billing table.

- [ ] **Step 5: Implement full-deck preflight and first dispatch**

`generateCarouselWork({workspaceId,workItemId,userId,preparedRevision})` must:

```ts
const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
if (!snapshot || snapshot.preparedRevision !== input.preparedRevision) return stale;
const quote = quoteCarouselDeck(snapshot.deck.slides.length);
const spendCheck = await checkSpend(input.workspaceId, "image_derivation", quote.credits);
if (!spendCheck.allowed) return { ok: false, error: { code: "credit_blocked", details: spendCheck } };
const slides = await materializeCarouselSlides({
  workspaceId: input.workspaceId,
  workItemId: input.workItemId,
  deck: snapshot.deck,
  visualContractHash: snapshot.visualContract.contractHash,
});
await startGenerationSettlement(carouselSlideSettlementAdapter(firstAnchor));
```

No total deck debit is recorded. The preflight only proves the balance at confirmation time.

After the first settlement returns success, reuse `recordBetaAnalyticsEvent()` exactly like `generateCreativeWork()` to emit `generation_confirmed` with `creativeWorkId`, `protocol:"carousel"`, `outputCount`, and the optional Studio correlation. When `dispatchNextCarouselStage()` wins the single set-review persistence after every current slide is completed, emit one server-side `output_ready`; never emit it from an individual slide completion.

- [ ] **Step 6: Implement `dispatchNextCarouselStage()`**

Read the current frozen snapshot and slides each time. Derive anchor positions with `carouselAnchorPositions()`. Dispatch at most the next missing anchor. Once all three anchors are completed, load their `providerBaseKey` buffers, build/store `creative-work/{workId}/carousel/{preparedRevision}/anchor-board.png`, set that same `anchorKey` on remaining drafts, and settle remaining slides with `Promise.allSettled()`. Idempotent queue CAS prevents duplicate sends, and one thrown dispatch cannot prevent its siblings from being attempted.

- [ ] **Step 7: Route confirmed carousel generation**

Extend the initial body with `preparedRevision: z.string().min(1).optional()`. After loading the work, require the field for carousel and call `generateCarouselWork()` with the already-validated `studioSessionId` and `rolloutVariant`; keep existing output/revision paths untouched. Return `{work, carouselSlides, preparedRevision}` with 202. Map stale revision to 409, insufficient credits to 402, and dispatch uncertainty to 502.

- [ ] **Step 8: Run tests and typecheck**

```bash
cd app
npm test -- \
  src/server/application/generate-carousel-work.test.ts \
  src/server/application/advance-carousel-generation.test.ts \
  src/server/generation/settlement-adapters.test.ts \
  src/server/generation/canonical/types.test.ts \
  src/server/jobs/heavy-image-events.test.ts \
  'src/app/api/creative-work/[id]/generate/route.test.ts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/application/generate-carousel-work.ts \
  app/src/server/application/generate-carousel-work.test.ts \
  app/src/server/application/advance-carousel-generation.ts \
  app/src/server/application/advance-carousel-generation.test.ts \
  app/src/server/generation/settlement-adapters.ts \
  app/src/server/generation/settlement-adapters.test.ts \
  app/src/server/generation/canonical/types.ts \
  app/src/server/generation/canonical/types.test.ts \
  app/src/server/jobs/heavy-image-events.ts \
  app/src/server/jobs/heavy-image-events.test.ts \
  'app/src/app/api/creative-work/[id]/generate/route.ts' \
  'app/src/app/api/creative-work/[id]/generate/route.test.ts'
git commit -m "feat: coordinate carousel generation"
```

---

### Task 6: Generate one slide with exact copy, objective QA, and chain continuation

**Files:**

- Create: `app/src/server/jobs/creative-work-carousel.ts`
- Create: `app/src/server/jobs/creative-work-carousel.test.ts`
- Modify: `app/src/server/creative-work/text-composite.ts`
- Modify: `app/src/server/creative-work/text-composite.test.ts`
- Modify: `app/src/server/creative-work/prompt.ts`
- Modify: `app/src/server/creative-work/prompt.test.ts`
- Modify: `app/src/server/creative-work/reference-plan.ts`
- Modify: `app/src/server/creative-work/reference-plan.test.ts`
- Modify: `app/src/app/api/inngest/route.ts`
- Modify: `app/src/server/jobs/image-worker.ts`
- Modify: `app/src/server/jobs/image-worker.test.ts`

**Interfaces:**

- Consumes: canonical direct generation, carousel slide rows/snapshot, visual contract, identity/reference assets, object storage, exact composition, existing objective QA, Task 5 settlement and continuation.
- Produces: `runCarouselTextComposition()`, `buildCarouselSlidePrompt()`, `runCreativeWorkCarouselSlide()`, web/worker Inngest registrations, and persisted slide artifacts/QA.

Extend reference roles additively:

```ts
export type CreativeWorkReferenceRole =
  | "revision" | "original" | "content" | "style"
  | "piece_required" | "piece_visual" | "brand_identity"
  | "anchor_board";
```

Add the text compositor without changing `runTextComposition()`:

```ts
export async function runCarouselTextComposition(input: {
  base: Buffer;
  dimensions: { width: number; height: number };
  primaryText: string;
  secondaryText: string | null;
  primaryRegion: CarouselTextRegion;
  secondaryRegion: CarouselTextRegion | null;
  safeAreaPx: number;
  font: BrandFontAsset | null;
  fontBuffer: Buffer | null;
  fallbackFamily: "sans" | null;
  brandColors: readonly string[];
}): Promise<{
  buffer: Buffer;
  provenance: {
    version: 1;
    copyHash: string;
    baseHash: string;
    outputHash: string;
    fontAuthority: "approved" | "fallback";
    fontFamily: string;
    layers: Array<{
      role: "primary" | "secondary";
      textHash: string;
      box: TextBox;
      renderedDpi: number;
      minimumDpi: number;
    }>;
  };
}>;
```

`buildCarouselSlidePrompt()` must include: frozen contract hash, role/purpose, layout-family instruction, palette/motifs/prohibitions, factual visual context, and a strict `DETERMINISTIC TEXT CONTRACT` telling the provider to render no words and keep both regions calm. Never send pending editorial diffs.

Job entry point:

```ts
export async function runCreativeWorkCarouselSlide(input: {
  event: {
    workspaceId: string;
    workItemId: string;
    slideId: string;
  };
  runId?: string;
  attempt?: number;
}): Promise<{ success: boolean; slideId: string; skipped?: boolean }>;
```

- [ ] **Step 1: Write failing text-composition tests**

Use real Sharp buffers. Assert exact output dimensions, copy/provenance hashes, approved font hash enforcement, `sans` fallback authority, primary/secondary region bounds, overflow failure below `minFontPx`, and safe-area rejection. Keep all existing social-post text tests unchanged.

```ts
expect(result.provenance).toMatchObject({
  fontAuthority: "fallback",
  fontFamily: "sans",
  copyHash: createHash("sha256").update(canonicalJsonStringify({
    primaryText: "Gancho exato",
    secondaryText: "Apoio exato",
  })).digest("hex"),
});
```

- [ ] **Step 2: Write failing prompt/reference tests**

Assert no approved copy appears as renderable provider text; the prompt names reserved regions and contract hash; anchors get brand/style references only; non-anchors put `anchor_board` first and keep required exact assets for post-composition rather than provider imitation; total provider references stay within four.

- [ ] **Step 3: Write failing job tests**

Cover:

- missing/cross-workspace work or slide skips before provider;
- duplicate completed event skips;
- queued → processing CAS;
- one direct canonical image call with destination `creative_work_carousel_slide`;
- provider base stored separately from final output;
- exact assets composed before copy;
- copy hash equals the frozen slide text;
- wrong dimensions, corrupt output, copy overflow, missing exact asset, contract mismatch, unauthorized reference, or objective QA fail marks only that slide failed;
- subjective warnings complete the slide and persist advice;
- completion calls `dispatchNextCarouselStage()` exactly once;
- failure calls it only for non-anchor aggregate reconciliation, never to skip a failed anchor;
- interrupted job marks/refunds the same slide idempotently.

- [ ] **Step 4: Run red tests**

```bash
cd app
npm test -- \
  src/server/creative-work/text-composite.test.ts \
  src/server/creative-work/prompt.test.ts \
  src/server/creative-work/reference-plan.test.ts \
  src/server/jobs/creative-work-carousel.test.ts \
  src/server/jobs/image-worker.test.ts
```

Expected: FAIL because the carousel compositor/job and registrations do not exist.

- [ ] **Step 5: Implement region-based text composition inside the existing module**

Reuse `escapePango()`, color contrast, Sharp, and font caching already in `text-composite.ts`. Extract only the lower-level render helper needed by both callers; keep the existing `runTextComposition()` signature and provenance stable. For fallback, omit `fontfile` and pass `font:"sans"` to Sharp/Pango. Throw the existing `TextCompositionError("brand_text_overflow")` when either region cannot meet its minimum.

- [ ] **Step 6: Implement the slide job using the canonical direct executor**

Build one `GenerationRequest`:

```ts
const request: GenerationRequest = {
  authorship: { workspaceId, userId: work.createdByUserId },
  origin: "quick_tool",
  surface: "quick_tool",
  intent: { mode: "social_post", objective: snapshot.deck.objective },
  identity: { clientProfileId: work.clientProfileId, referenceImages, brandConstraints: null },
  format: { targetFormat: snapshot.deck.format, dimensions, constraints: null },
  source: {
    parentId: slide.parentSlideId,
    sourceVersionId: slide.parentSlideId,
    lineageId: slide.lineageId,
    packageSource: "creative_work_carousel_slide",
  },
  prompt: { text: prompt },
  cost: { chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput, refundPolicy: "default" },
  idempotency: { billingKey: carouselSlideBillingKey(workItemId, slide.id), skipWhenOutputExists: true },
  destination: {
    kind: "creative_work_carousel_slide",
    id: slide.id,
    storagePrefix: `creative-work/${workItemId}/carousel/slides/${slide.id}`,
    workItemId,
  },
  executionPolicy: "direct",
  attempt: slide.versionNumber - 1,
};
```

Persist the untouched provider image as `providerBaseKey`. Compose exact assets and then copy into a final PNG. Persist `previewKey` only if the existing thumbnail helper actually produces a smaller artifact; otherwise set it equal to `outputKey` and do not add a thumbnail pipeline.

- [ ] **Step 7: Reuse objective QA without its correction/retry branch**

Call `runCreativeWorkQualityAssessment()` with the slide ID and frozen fact pack. Persist its payload. If `objectiveVerdict === "fail"`, mark failed and refund under the same terminal policy; do not make the second objective-correction image call used by legacy output recovery. If `pass|inconclusive`, complete the slide; `inconclusive` is a visible warning.

- [ ] **Step 8: Register both Inngest runtimes**

Export `creativeWorkCarouselSlideJob` for the web route and `createCreativeWorkCarouselSlideJobV2(client)` for the image worker, following `creative-work-source.ts`. Use the same account-wide image concurrency key already protecting Creative Work. Add both registrations and extend `image-worker.test.ts` to assert the IDs.

- [ ] **Step 9: Run tests and typecheck**

```bash
cd app
npm test -- \
  src/server/creative-work/text-composite.test.ts \
  src/server/creative-work/prompt.test.ts \
  src/server/creative-work/reference-plan.test.ts \
  src/server/jobs/creative-work-carousel.test.ts \
  src/server/jobs/image-worker.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/jobs/creative-work-carousel.ts \
  app/src/server/jobs/creative-work-carousel.test.ts \
  app/src/server/creative-work/text-composite.ts \
  app/src/server/creative-work/text-composite.test.ts \
  app/src/server/creative-work/prompt.ts \
  app/src/server/creative-work/prompt.test.ts \
  app/src/server/creative-work/reference-plan.ts \
  app/src/server/creative-work/reference-plan.test.ts \
  app/src/app/api/inngest/route.ts \
  app/src/server/jobs/image-worker.ts \
  app/src/server/jobs/image-worker.test.ts
git commit -m "feat: generate coherent carousel slides"
```

---

### Task 7: Add versioned revisions, deck approval, and ordered export

**Files:**

- Create: `app/src/server/application/revise-carousel.ts`
- Create: `app/src/server/application/revise-carousel.test.ts`
- Create: `app/src/server/application/export-carousel-work.ts`
- Create: `app/src/server/application/export-carousel-work.test.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.test.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/download/route.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/download/route.test.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/revise/route.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/revise/route.test.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/export/route.ts`
- Create: `app/src/app/api/creative-work/[id]/carousel/export/route.test.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.test.ts`

**Interfaces:**

- Consumes: current slide versions, frozen provider bases, visual contract, settlement adapter, object storage, JSZip, work PATCH route, and slide repository CAS.
- Produces: `reviseCarouselSlide()`, `reviseCarouselDeck()`, `approveCarouselDeck()`, `buildCarouselManifest()`, `exportCarouselWork()`, and download/export routes.

Revision commands:

```ts
export type ReviseCarouselSlideInput = {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  expectedVersion: number;
  revisionKey: string;
} & (
  | { kind: "copy"; primaryText: string; secondaryText: string | null }
  | { kind: "visual"; instruction: string }
  | { kind: "retry" }
);

export type ReviseCarouselDeckInput = {
  workspaceId: string;
  workItemId: string;
  expectedRevision: string;
  revisionKey: string;
  plan: CarouselDeckPlanV1;
  globalVisualInstruction: string | null;
};
```

Manifest contract:

```ts
export type CarouselManifestV1 = {
  version: 1;
  workId: string;
  deckRevision: string;
  format: "4:5" | "1:1";
  visualContractHash: string;
  approvedAt: string;
  slides: Array<{
    position: number;
    fileName: string;
    slideId: string;
    lineageId: string;
    versionNumber: number;
    role: CarouselNarrativeRole;
    primaryText: string;
    secondaryText: string | null;
    copyAuthority: CarouselCopyAuthority;
    sourceFactIds: string[];
    outputHash: string;
  }>;
};
```

- [ ] **Step 1: Write failing revision tests**

Assert:

- copy revision creates a child, keeps the old row, sets human authority, reuses `providerBaseKey`, recomposes locally, and records zero provider/credit calls;
- visual revision creates a child with the same contract/anchor, settles one new provider call, and keeps the parent;
- failed-slide retry creates one child with the same copy/contract/anchor, settles one provider call, and never requeues or overwrites the failed parent;
- stale version/revision returns conflict;
- reorder recalculates positions and role→family mapping and invalidates only slides whose position/family changed;
- global visual instruction creates a new deck revision, invalidates all current slides, clears deck approval/quality, and restarts trio → remaining;
- idempotent `revisionKey` returns the same descendants.

- [ ] **Step 2: Write failing approval/export tests**

Approval must reject missing positions, non-contiguous order, non-completed current slides, objective failures, wrong contract hashes, wrong workspace, and a stale deck revision. It must accept advisory warnings. Export must use `01.png`…`08.png`, include `manifest.json`, sort by position regardless of DB return order, exclude storage keys/prompts/provider metadata, and rebuild the same manifest on replay.

```ts
expect(Object.keys(zip.files)).toEqual([
  "01.png", "02.png", "03.png", "04.png", "05.png", "manifest.json",
]);
```

- [ ] **Step 3: Write failing HTTP tests**

Cover auth/workspace isolation, strict bodies, copy/visual/retry status codes, deck-revision route, individual completed-slide redirect, approve action on the existing PATCH route, ZIP response headers, incomplete-deck 409, and no campaign/output mutation.

Add PATCH action:

```ts
const approveCarouselSchema = z.object({
  action: z.literal("approveCarousel"),
  revision: z.string().min(1),
}).strict();
```

- [ ] **Step 4: Run red tests**

```bash
cd app
npm test -- \
  src/server/application/revise-carousel.test.ts \
  src/server/application/export-carousel-work.test.ts \
  'src/app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.test.ts' \
  'src/app/api/creative-work/[id]/carousel/slides/[slideId]/download/route.test.ts' \
  'src/app/api/creative-work/[id]/carousel/revise/route.test.ts' \
  'src/app/api/creative-work/[id]/carousel/export/route.test.ts' \
  'src/app/api/creative-work/[id]/route.test.ts'
```

Expected: FAIL because revision, approval, and export commands do not exist.

- [ ] **Step 5: Implement copy-only and visual descendants**

For copy revisions, load the parent's `providerBaseKey`, re-run exact composition + `runCarouselTextComposition()`, persist the child completed, then refresh set QA. For visual revisions, create the child `draft`, preserve contract/anchor, and use the one-slide settlement. A retry is accepted only from a failed current slide; it creates the same kind of draft descendant without adding an instruction. Validate new text against the frozen fact pack before writing any descendant.

- [ ] **Step 6: Implement reorder and global direction revisions**

Use stable `slideId` to compare old/new deck plans. A position/family/copy change creates a descendant for that lineage; untouched slides remain current and retain their version. A global visual instruction copies the prior contract, sets `directionInstruction` to the trimmed explicit instruction, recomputes `contractHash` from that complete contract without its own hash, descendants every position, clears `carouselApprovedRevision` and `carouselQuality`, and dispatches only the new anchor trio first. Reorder-only revisions keep the existing instruction and hash.

- [ ] **Step 7: Implement approval and ZIP with installed JSZip**

`approveCarouselDeck()` performs all objective checks in one transaction and sets only `carouselApprovedRevision`. `exportCarouselWork()` requires that field to equal the current draft revision, loads current completed slide buffers with `p-limit(4)`, hashes final buffers, builds the manifest, and returns a Node stream. No export row/table is added.

- [ ] **Step 8: Add the routes**

Keep all routes below `creative-work/:id/carousel`. `POST carousel/revise` owns reorder/global-direction bodies; the per-slide route owns copy/visual/retry bodies. Individual download resolves a signed URL only for a current completed slide belonging to the authenticated workspace. ZIP uses `Content-Type: application/zip` and `Content-Disposition: attachment; filename="carousel-{workId}.zip"`.

- [ ] **Step 9: Run tests and typecheck**

```bash
cd app
npm test -- \
  src/server/application/revise-carousel.test.ts \
  src/server/application/export-carousel-work.test.ts \
  'src/app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.test.ts' \
  'src/app/api/creative-work/[id]/carousel/slides/[slideId]/download/route.test.ts' \
  'src/app/api/creative-work/[id]/carousel/revise/route.test.ts' \
  'src/app/api/creative-work/[id]/carousel/export/route.test.ts' \
  'src/app/api/creative-work/[id]/route.test.ts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/application/revise-carousel.ts \
  app/src/server/application/revise-carousel.test.ts \
  app/src/server/application/export-carousel-work.ts \
  app/src/server/application/export-carousel-work.test.ts \
  'app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.ts' \
  'app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.test.ts' \
  'app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/download/route.ts' \
  'app/src/app/api/creative-work/[id]/carousel/slides/[slideId]/download/route.test.ts' \
  'app/src/app/api/creative-work/[id]/carousel/revise/route.ts' \
  'app/src/app/api/creative-work/[id]/carousel/revise/route.test.ts' \
  'app/src/app/api/creative-work/[id]/carousel/export/route.ts' \
  'app/src/app/api/creative-work/[id]/carousel/export/route.test.ts' \
  'app/src/app/api/creative-work/[id]/route.ts' \
  'app/src/app/api/creative-work/[id]/route.test.ts'
git commit -m "feat: revise and export carousel decks"
```

---

### Task 8: Expose carousel state through one dedicated client controller

**Files:**

- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/lib/hooks/use-creative-work.test.tsx`
- Create: `app/src/components/creative-work/useCarouselComposer.ts`
- Create: `app/src/components/creative-work/useCarouselComposer.test.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx`
- Modify: `app/src/app/(dashboard)/dashboard-search-params.ts`
- Create: `app/src/app/(dashboard)/dashboard-search-params.test.ts`

**Interfaces:**

- Consumes: progressive Studio controller from the prerequisite plan and all Task 3–7 APIs.
- Produces: carousel detail mapping/mutations and the `useCarouselComposer()` view model used only by Task 9 components.

Extend client DTOs from server types instead of redefining their unions:

```ts
export interface CreativeWorkItem {
  // existing fields unchanged
  toolKind: CreativeWorkIntent;
  carouselApprovedRevision: string | null;
  carouselQuality: PublicCarouselQualityV1 | null;
  settings: {
    // existing fields unchanged
    carouselDraft?: CarouselDraftStateV1;
  };
}

export type PublicCarouselQualityV1 = Omit<
  CarouselDeckQualityV1,
  "contactSheetKey"
> & { hasContactSheet: boolean };

export interface CreativeWorkDetail {
  // existing fields unchanged
  carouselSlides: PublicCarouselSlide[];
}
```

Do not expose `providerBaseKey`, `outputKey`, `previewKey`, `anchorKey`, `generationOperationKey`, prompts, or internal contact-sheet storage keys. Public slides use booleans and download endpoints:

```ts
export type PublicCarouselSlide = {
  id: string;
  lineageId: string;
  parentSlideId: string | null;
  versionNumber: number;
  deckRevision: string;
  position: number;
  role: CarouselNarrativeRole;
  primaryText: string;
  secondaryText: string | null;
  copyAuthority: CarouselCopyAuthority;
  sourceFactIds: string[];
  layoutFamily: CarouselLayoutFamily;
  status: CarouselSlideStatus;
  hasOutput: boolean;
  errorCode: string | null;
  quality: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
```

Carousel controller contract:

```ts
export function useCarouselComposer(input: {
  workId: string;
  preparedPlan: PreparedPlanProjectionV1 | null;
  preparePlan: () => Promise<PreparedPlanProjectionV1 | null>;
  confirmGeneration: (preparedRevision?: string) => Promise<void>;
  recordCanonicalEvent: (
    event: "creative_work_reviewed" | "creative_work_approved",
    properties: { creativeWorkId: string; protocol: "carousel"; outputCount: number },
  ) => void;
}) {
  return {
    draft, slides, quality, selectedSlideId, selectedSlide,
    phase, findings, canPrepare, canGenerate, canApprove, isBusy,
    askForPlan, answerQuestions, acceptChange, rejectChange,
    editSlide, addSlide, removeSlide, moveSlide,
    prepareCarousel, generateCarousel, reviseSlide, retrySlide,
    approveDeck, downloadSlide, exportDeck, selectSlide,
  };
}
```

- [ ] **Step 1: Write failing detail-map tests**

Assert carousel timestamps map to `Date`, polling continues for queued/processing slides even when outputs are empty, private keys are absent, old works map `carouselSlides:[]`, and carousel aggregate state does not depend on `outputs`.

- [ ] **Step 2: Write failing controller tests**

Cover:

- first plan call flushes the generic draft then posts answers;
- blocking questions remain visible after cache refetch;
- accept/reject/edit/add/remove/reorder update only `settings.carouselDraft` and preserve stable IDs;
- add/remove enforce 5–8;
- human edit sets `authority:"human_edit"` and supersedes pending AI changes for that field;
- prepare never calls generation;
- generate calls one explicit `confirmGeneration(preparedRevision)`;
- Enter/textarea keydown never calls it;
- copy revision chooses `kind:"copy"`; visual revision chooses `kind:"visual"`;
- retry is enabled only for the selected failed current slide and posts `kind:"retry"` once;
- successful approval enables export;
- the first persisted review phase records `creative_work_reviewed` once, and a successful deck approval records `creative_work_approved` once through the injected prerequisite recorder;
- uncertain generation response disables a second click until detail reconciliation.

- [ ] **Step 3: Write generic-controller regressions**

Add `carousel` to `ComposerIntent`, storage keys, URL parsing, and explicit objective choices. In `canonicalQuote()`, return `{unitCount:0,credits:0}` for carousel because quote comes from its deck; never call `quoteCreativeWork({intent:"carousel"})`. Limit carousel uploads to one image and force `usage:"style"`. Existing four protocols keep their exact behavior.

```ts
function canonicalQuote(
  intent: ComposerIntent,
  format: Format,
  targetFormats: Format[],
  directionPool?: CreativeDirectionPool,
): CreativeWorkQuote {
  if (intent === "carousel") return { unitCount: 0, credits: 0 };
  const { unitCount, credits } = quoteCreativeWork({
    intent, format, targetFormats, directionPool,
  });
  return { unitCount, credits };
}
```

- [ ] **Step 4: Run red tests**

```bash
cd app
npm test -- \
  src/lib/hooks/use-creative-work.test.tsx \
  src/components/creative-work/useCarouselComposer.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  'src/app/(dashboard)/dashboard-search-params.test.ts'
```

Expected: FAIL because client carousel types/controller do not exist.

- [ ] **Step 5: Implement detail mutations in the existing hook module**

Add small TanStack mutations for plan, revise, approve, and export cache invalidation. Reuse `creativeWorkKey(workItemId)` and `readError()`. Do not add a second query cache or fetch wrapper.

- [ ] **Step 6: Implement `useCarouselComposer()` as derived server state**

Keep only selection and pending local text in React state. Derive phase from persisted data:

```ts
const phase = questions.length > 0 ? "questions"
  : !draft.plan ? "entry"
  : !preparedRevision ? "sequence"
  : slides.length === 0 ? "ready_to_generate"
  : slides.some(active) ? "generating"
  : "review";
```

Use the generic progressive `preparePlan()` and `confirmGeneration()` commands. Do not reproduce their autosave, prepared-revision, double-submit, analytics, or uncertainty logic.
Use the generic controller's existing canonical-event recorder as the injected callback; do not instantiate a second Studio session or beta-event hook.

- [ ] **Step 7: Run tests and typecheck**

```bash
cd app
npm test -- \
  src/lib/hooks/use-creative-work.test.tsx \
  src/components/creative-work/useCarouselComposer.test.tsx \
  src/components/creative-work/useCreativeComposer.test.tsx \
  'src/app/(dashboard)/dashboard-search-params.test.ts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Update graph and commit**

```bash
graphify update .
git add \
  app/src/lib/hooks/use-creative-work.ts \
  app/src/lib/hooks/use-creative-work.test.tsx \
  app/src/components/creative-work/useCarouselComposer.ts \
  app/src/components/creative-work/useCarouselComposer.test.tsx \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  'app/src/app/(dashboard)/dashboard-search-params.ts' \
  'app/src/app/(dashboard)/dashboard-search-params.test.ts'
git commit -m "feat: control carousel wizard state"
```

---

### Task 9: Render the Mesa de sequência and deck review

**Files:**

- Create: `app/src/components/creative-work/CarouselComposer.tsx`
- Create: `app/src/components/creative-work/CarouselComposer.test.tsx`
- Create: `app/src/components/creative-work/CarouselSequenceBoard.tsx`
- Create: `app/src/components/creative-work/CarouselSequenceBoard.test.tsx`
- Create: `app/src/components/creative-work/CarouselSlideEditor.tsx`
- Create: `app/src/components/creative-work/CarouselSlideEditor.test.tsx`
- Create: `app/src/components/creative-work/CarouselVisualSummary.tsx`
- Create: `app/src/components/creative-work/CarouselVisualSummary.test.tsx`
- Create: `app/src/components/creative-work/CarouselDeckReview.tsx`
- Create: `app/src/components/creative-work/CarouselDeckReview.test.tsx`
- Modify: `app/src/components/creative-work/CreativeToolCards.tsx`
- Modify: `app/src/components/creative-work/CreativeToolCards.test.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/components/creative-work/CreativeWorkResumeSurface.tsx`
- Modify: `app/src/components/creative-work/CreativeWorkResumeSurface.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Interfaces:**

- Consumes: Task 8 controller and the progressive Studio hierarchy.
- Produces: the visible carousel wizard, sequence editor, generation/review surface, and resume path.

- [ ] **Step 1: Write failing tool/composer routing tests**

Assert five explicit protocol buttons with `Criar carrossel`; selecting it preserves free entry and focuses carousel configuration; `CreativeComposer` renders `CarouselComposer` only for carousel; other protocols render their current controls; resume of a carousel work opens the deck rather than `CreativeProposalGrid`.

- [ ] **Step 2: Write failing sequence-board accessibility tests**

Assert all slides remain visible; selected slide has `aria-current`; native drag/drop calls `moveSlide`; every card also has `Mover para cima` / `Mover para baixo`; boundary buttons disable; keyboard focus follows the moved slide; add/remove respect 5–8; mobile uses horizontal scroll without hiding order/status.

```tsx
<button type="button" onClick={() => onMove(slide.slideId, -1)} disabled={slide.position === 1}>
  {t("moveUp")}
</button>
```

- [ ] **Step 3: Write failing slide-editor tests**

Assert role, purpose, primary/secondary text, density, authority, before/after/reason, accept/reject/edit, objective finding, copy-only action, visual-refetch action, and human-edit protection are visible/correct. A pending AI suggestion never replaces the textarea value until accepted.

- [ ] **Step 4: Write failing visual/review tests**

Assert palette, font authority/fallback limitation, motifs, three layout families, prohibitions, exact assets, temporary reference scope, slide status/version, objective failures, advisory set warnings, an explicit failed-slide retry, individual download, approval, and ZIP export. No credit amount, anchor approval, automatic/hidden retry, caption, publish, or canvas control may render.

- [ ] **Step 5: Write the phase-shell tests**

The semantic order is:

```text
free entry → blocking questions (only if any) → sequence board + selected editor
→ visual summary → Gerar carrossel → generation states → deck review/export
```

Assert `Gerar carrossel` is disabled until a prepared revision exists, click calls once, Enter does nothing, focus moves to the first blocking question/sequence heading/review heading as phases change, and the live region announces completed/failed counts.

- [ ] **Step 6: Run red tests**

```bash
cd app
npm test -- \
  src/components/creative-work/CreativeToolCards.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/creative-work/CarouselComposer.test.tsx \
  src/components/creative-work/CarouselSequenceBoard.test.tsx \
  src/components/creative-work/CarouselSlideEditor.test.tsx \
  src/components/creative-work/CarouselVisualSummary.test.tsx \
  src/components/creative-work/CarouselDeckReview.test.tsx \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/CreativeWorkResumeSurface.test.tsx
```

Expected: FAIL because carousel UI components and copy do not exist.

- [ ] **Step 7: Add the fifth compact protocol card**

Use an installed Lucide multi-panel icon. Keep the progressive two-column/list fallback from the prerequisite plan. Gate the card with the carousel rollout prop from Task 10; old deep links remain readable even when new creation is disabled.

- [ ] **Step 8: Implement the dedicated wizard components**

Keep components presentational. `CarouselComposer` calls `useCarouselComposer()` once and passes narrow props. Use CSS/native drag/drop and the explicit movement buttons; add no DnD package. Use existing design tokens, focus rings, buttons, error/live-region patterns, and responsive breakpoints.

- [ ] **Step 9: Add pt-BR and English copy**

The primary pt-BR labels are exactly:

```text
Criar carrossel
Transforme uma ideia ou texto em uma sequência visual coerente.
Organizar conteúdo
Mesa de sequência
Sistema visual
Gerar carrossel
Refazer esta tela
Alterar somente o texto
Tentar novamente esta tela
Aprovar carrossel
Baixar carrossel (.zip)
```

Avoid “mágico”, “revolucionário”, “potencialize”, “eleve”, “desbloqueie”, or AI meta-copy.

- [ ] **Step 10: Run tests, accessibility-focused component suite, and typecheck**

```bash
cd app
npm test -- \
  src/components/creative-work/CreativeToolCards.test.tsx \
  src/components/creative-work/CreativeComposer.test.tsx \
  src/components/creative-work/CarouselComposer.test.tsx \
  src/components/creative-work/CarouselSequenceBoard.test.tsx \
  src/components/creative-work/CarouselSlideEditor.test.tsx \
  src/components/creative-work/CarouselVisualSummary.test.tsx \
  src/components/creative-work/CarouselDeckReview.test.tsx \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/components/creative-work/CreativeWorkResumeSurface.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Update graph and commit**

```bash
graphify update .
git add \
  app/src/components/creative-work/CarouselComposer.tsx \
  app/src/components/creative-work/CarouselComposer.test.tsx \
  app/src/components/creative-work/CarouselSequenceBoard.tsx \
  app/src/components/creative-work/CarouselSequenceBoard.test.tsx \
  app/src/components/creative-work/CarouselSlideEditor.tsx \
  app/src/components/creative-work/CarouselSlideEditor.test.tsx \
  app/src/components/creative-work/CarouselVisualSummary.tsx \
  app/src/components/creative-work/CarouselVisualSummary.test.tsx \
  app/src/components/creative-work/CarouselDeckReview.tsx \
  app/src/components/creative-work/CarouselDeckReview.test.tsx \
  app/src/components/creative-work/CreativeToolCards.tsx \
  app/src/components/creative-work/CreativeToolCards.test.tsx \
  app/src/components/creative-work/CreativeComposer.tsx \
  app/src/components/creative-work/CreativeComposer.test.tsx \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/src/components/creative-work/CreativeWorkResumeSurface.tsx \
  app/src/components/creative-work/CreativeWorkResumeSurface.test.tsx \
  app/messages/pt-BR.json \
  app/messages/en.json
git commit -m "feat: add carousel sequence wizard"
```

---

### Task 10: Gate creation, prove the full controlled flow, and prepare human evidence

**Files:**

- Modify: `app/src/server/studio-rollout.ts`
- Modify: `app/src/server/studio-rollout.test.ts`
- Modify: `app/src/server/validation/env.ts`
- Modify: `app/src/server/validation/env.test.ts`
- Modify: `app/.env.example`
- Modify: `render.yaml`
- Modify: `app/src/app/(dashboard)/page.tsx`
- Modify: `app/src/app/(dashboard)/page.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/src/server/creative-work/job-telemetry.ts`
- Modify: `app/src/server/creative-work/job-telemetry.test.ts`
- Create: `app/tests/e2e/creative-work-carousel.spec.ts`
- Modify: `app/playwright.config.ts`
- Create: `app/scripts/check-carousel-human-gate.ts`
- Create: `app/scripts/check-carousel-human-gate.test.ts`
- Create: `docs/evidence/carousel-human-gate.template.json`
- Create: `docs/runbooks/studio-carousel-rollout.md`

**Interfaces:**

- Consumes: prerequisite Studio rollout bucket/session analytics, controlled provider, existing Create Post E2E fixture, carousel funnel/state, and final UI.
- Produces: deterministic new-creation exposure, correlated operational telemetry, full local acceptance proof, and a validator for the separately authorized nine-deck human gate.

Rollout function:

```ts
export function isStudioCarouselEnabled(workspaceId: string, percent: number): boolean {
  const bounded = Math.max(0, Math.min(100, Math.trunc(percent)));
  return studioRolloutBucket(workspaceId) < bounded;
}
```

Add `STUDIO_CAROUSEL_ROLLOUT_PERCENT` as `z.coerce.number().int().min(0).max(100).default(0)`. Both web and worker get the environment value, but only the authenticated page uses it to expose new creation. Existing carousel work/detail/export stays readable when the value returns to zero.

- [ ] **Step 1: Write failing rollout tests**

Assert 0/100 boundaries, same bucket as progressive Studio, new card hidden at zero, enabled for a known included workspace, old carousel `workId` resumes at zero, and no environment value is sent to the browser.

- [ ] **Step 2: Write failing telemetry tests**

Extend existing logs with safe fields only:

```ts
{
  protocol: "carousel",
  slideCount,
  inputKind,
  blockingQuestionCount,
  anchorState,
  failedSlideCount,
  manualRetryCount,
  deckRevisionCount,
}
```

Assert the canonical funnel chain is complete: generic `preparePlan()` emits `briefing_ready`; Task 5 emits `generation_confirmed` and one deck-level `output_ready`; Task 8 emits `creative_work_reviewed` and `creative_work_approved` through the injected prerequisite recorder. Never emit `output_ready` per slide. Do not log copy, prompt, answers, fact values, storage keys, or temporary-reference names.

- [ ] **Step 3: Write the controlled-provider E2E first**

Reuse the existing `create-post-e2e.json` login/profile/credits; do not create another seed. The test must:

1. choose `Criar carrossel`;
2. enter a raw long text;
3. answer one controlled blocking question;
4. receive five slides;
5. accept one suggestion and human-edit another;
6. reorder with the accessible button;
7. prepare and click `Gerar carrossel` once;
8. observe cover, middle, closing, then remaining states without an intermediate button;
9. inject `[e2e:hard-fail-once]` into one non-anchor purpose and verify only it fails;
10. retry only that slide and preserve sibling IDs;
11. change one completed slide's copy and prove provider-call evidence count does not increase;
12. approve the deck;
13. download ZIP and assert `01.png`…`05.png` + manifest order/copy/hash fields;
14. reload the work and verify the same current versions and approval.

- [ ] **Step 4: Run red rollout/unit/E2E tests**

```bash
cd app
npm test -- \
  src/server/studio-rollout.test.ts \
  src/server/validation/env.test.ts \
  'src/app/(dashboard)/page.test.tsx' \
  src/components/dashboard/DashboardHomeActions.test.tsx \
  src/server/creative-work/job-telemetry.test.ts \
  scripts/check-carousel-human-gate.test.ts
npx playwright test tests/e2e/creative-work-carousel.spec.ts --project=serial-flows
```

Expected: unit tests FAIL on missing rollout/telemetry/gate code; E2E FAIL because carousel is not enabled/configured in the test server yet.

- [ ] **Step 5: Implement rollout and telemetry**

Reuse `studioRolloutBucket()`. Add the environment variable at `0` in `.env.example` and `render.yaml`. Do not change a live Render value. Pass a boolean to `DashboardHomeActions`, hide only new carousel selection when false, and keep resume/detail routes functional.

- [ ] **Step 6: Implement the human-gate validator, not the paid run**

The template has nine entries: three named brands × `short_idea|long_text|pre_split`. Each entry records slide count, factual inventions, corrupted text count, visual-language verdict, narrative-progression verdict, self-contained failures, reviewer, and artifact IDs. The script exits nonzero unless:

```ts
const accepted =
  entries.length === 9 &&
  entries.every((entry) => entry.inventedFacts === 0 && entry.corruptedTexts === 0) &&
  entries.filter((entry) => entry.visualLanguage === "single_system").length >= 8 &&
  entries.filter((entry) => entry.narrativeProgression === "clear").length >= 8 &&
  entries.every((entry) => entry.selfContainedFailures === 0);
```

The implementation task creates only the validator/template. Generating nine real decks and filling reviewer verdicts requires a separate paid-generation authorization and human review.

- [ ] **Step 7: Make controlled E2E pass**

Add `carousel` to the serial-flow regex. Start the local app/worker with `E2E_CONTROLLED_PROVIDER=true`, `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100`, and `STUDIO_CAROUSEL_ROLLOUT_PERCENT=100`; use isolated test storage and Inngest exactly like the existing Create Post gate. Do not use a live provider.

- [ ] **Step 8: Run the complete local proof**

```bash
cd app
npm test -- \
  src/server/creative-work/carousel-contracts.test.ts \
  src/server/creative-work/carousel-editorial.test.ts \
  src/server/creative-work/carousel-visual.test.ts \
  src/server/repositories/creative-work-carousel.test.ts \
  src/server/application/plan-carousel-work.test.ts \
  src/server/application/prepare-carousel-work.test.ts \
  src/server/application/generate-carousel-work.test.ts \
  src/server/application/advance-carousel-generation.test.ts \
  src/server/jobs/creative-work-carousel.test.ts \
  src/server/application/revise-carousel.test.ts \
  src/server/application/export-carousel-work.test.ts \
  src/components/creative-work/useCarouselComposer.test.tsx \
  src/components/creative-work/CarouselComposer.test.tsx \
  src/components/creative-work/CarouselSequenceBoard.test.tsx \
  src/components/creative-work/CarouselSlideEditor.test.tsx \
  src/components/creative-work/CarouselVisualSummary.test.tsx \
  src/components/creative-work/CarouselDeckReview.test.tsx \
  src/server/studio-rollout.test.ts \
  scripts/check-carousel-human-gate.test.ts
npm run lint
npm run typecheck
npx playwright test tests/e2e/creative-work-carousel.spec.ts --project=serial-flows
```

Expected: PASS. Report unit, lint, typecheck, controlled-provider E2E, DB integration, paid/live generation, and human review as separate evidence categories.

After the controlled E2E passes, open the seeded carousel at the `Mesa de sequência` state in the local browser, capture one desktop screenshot that shows the whole ordered deck and selected editor, inspect it for clipping/order/coherence, and send that image back in the implementation thread. Keep the screenshot as an untracked test artifact; do not add it to the repository or claim human visual approval from it.

- [ ] **Step 9: Write the rollback/runbook**

Document: keep percentage `0` until automated proof and human gate; internal → restricted → expanded stages; rollback to `0` stops only new creation; existing works remain readable/retryable/exportable; immediate rollback conditions are wrong order, stale snapshot, duplicate charge, cross-workspace slide, approved-copy mismatch, missing approved position, or overwritten version.

- [ ] **Step 10: Update graph and commit**

```bash
graphify update .
git add \
  app/src/server/studio-rollout.ts \
  app/src/server/studio-rollout.test.ts \
  app/src/server/validation/env.ts \
  app/src/server/validation/env.test.ts \
  app/.env.example \
  render.yaml \
  'app/src/app/(dashboard)/page.tsx' \
  'app/src/app/(dashboard)/page.test.tsx' \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/src/server/creative-work/job-telemetry.ts \
  app/src/server/creative-work/job-telemetry.test.ts \
  app/tests/e2e/creative-work-carousel.spec.ts \
  app/playwright.config.ts \
  app/scripts/check-carousel-human-gate.ts \
  app/scripts/check-carousel-human-gate.test.ts \
  docs/evidence/carousel-human-gate.template.json \
  docs/runbooks/studio-carousel-rollout.md
git commit -m "test: gate Studio carousel rollout"
```

---

## Human Gate and Rollout Handoff

Do not execute these steps during ordinary implementation:

1. Obtain explicit authorization for the capped live-provider batch.
2. Generate exactly nine decks: three approved brands × short idea, long text, and pre-split input.
3. Record real provider IDs/cost separately from automated results.
4. Have a human reviewer complete a copy of `docs/evidence/carousel-human-gate.template.json`.
5. Run `npx tsx scripts/check-carousel-human-gate.ts <evidence-file>`.
6. Only after PASS, approve internal rollout; raise the percentage in separate deploy-controlled steps.

## Spec Coverage Matrix

| Spec requirement | Task(s) |
| --- | --- |
| Fifth Studio protocol; free input; one temporary reference | 1, 3, 8, 9 |
| Ask only blocking questions; tracked editorial changes; anti-slop | 3, 8, 9 |
| 5–8 slides; narrative roles; human authority; fact grounding | 1, 3, 4 |
| Mesa de sequência; accessible reorder; responsive review | 8, 9 |
| Córtex baseline; one visual direction; three rhythm families | 4, 9 |
| Exact copy/assets; overflow protection; fallback authority | 4, 6 |
| Additive schema; slide lineage; no `pageIndex` on outputs | 2 |
| Explicit prepare; no provider/billing before confirmation | 4, 8 |
| Full-balance preflight; per-dispatch settlement | 5 |
| Automatic dependent trio; shared anchor board; parallel remainder | 5, 6 |
| Objective vs subjective QA; no hidden retries | 6 |
| Partial failure, reload, manual retry, copy-only revision | 2, 5, 6, 7, 8 |
| Reorder/global direction revisions without overwrite | 7 |
| Deck approval, ordered PNGs, ZIP, manifest | 7, 9 |
| Funnel/operational telemetry; workspace rollout; rollback | 10 |
| Unit/integration/UI/E2E proof and separate nine-deck human gate | 1–10 |

## Final Verification

Before offering rollout, verify the final diff contains no:

- changes to `creative_work_outputs` schema or selection semantics;
- generic multi-page protocol abstraction;
- new dependency or font asset;
- cost copy, anchor approval, auto-retry, caption, publication, or canvas UI;
- private storage/prompt/provider fields in GET responses or manifests;
- live rollout increase, paid provider call, or fabricated human-gate evidence.

Run `git diff --check`, the complete Task 10 proof, `git status --short`, and `graphify update .`. Report every skipped external gate plainly.
