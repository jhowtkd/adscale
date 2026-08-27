# Real-Brand Commercial Studies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Produce an academically framed, reproducible commercial-screen package for Nike `Just Do It`, MTV's mutable identity, and Absolut's bottle system using the existing ADScale Brand Training, Creative Work, controlled-provider, evidence, and screenshot flows.

**Architecture:** Add one versioned editorial manifest and three dossiers around the existing product. A dev-only seed creates a dedicated owner workspace, three isolated client profiles, training references, and controlled Creative Works. The current screenshot script gains an optional manifest-driven mode. Existing real-provider flows and the Brand Cortex evidence package remain the only path for real-generation claims. No product UI, auth role, database table, provider, or generation pipeline is added.

**Tech Stack:** Next.js 16, TypeScript, Drizzle/PostgreSQL, Better Auth, Zod, Vitest, Playwright, Sharp, existing object storage, existing controlled and real image providers.

**Spec:** `docs/superpowers/specs/2026-08-27-real-brand-commercial-studies-design.md`

## Global Constraints

- The public framing is always: `Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.`
- Treat Nike, MTV, and Absolut as research subjects, never as clients, partners, sponsors, or endorsements.
- Do not create a new superuser role. Create a dedicated lab owner account and rely on the existing dev-admin/platform-owner authorization when elevated access is required.
- Do not add tables, migrations, dashboard routes, CMS screens, feature flags, providers, or a second screenshot framework.
- Do not scrape campaigns in bulk. Every reference must have source URL, author/publisher, access date, analytical purpose, and a recorded usage status.
- An exact logo, font, bottle silhouette, photograph, film frame, or advertisement may enter training or a final composition only when its recorded usage status is `approved`. `review_required` and `blocked` assets may appear only as linked/cited research, not as uploaded training assets or public artwork.
- Controlled-provider outputs prove interface state only. Never label them as real generation, provider delivery, or final campaign artwork.
- Do not perform a paid generation, paid retry, deploy, publication, or live production mutation without a fresh explicit approval at the relevant checkpoint.
- Technical checks, stored-provider evidence, editorial review, legal review, and human visual approval are separate gates.
- Preserve unrelated work. Stage only paths named in each task; never use `git add .`, reset, clean, or broad checkout commands.
- After source changes, run `graphify update .` before the corresponding final source commit.

## Deliverable Contract

The approved base package contains exactly:

- 15 desktop screens: five stages per brand at 1440×1000.
- 9 mobile screens: training, results, and decision per brand at 390×844.
- 6 isolated real results: two selected pieces per brand.
- One resolved manifest and one hash index that state source, brand, stage, route, viewport, provenance, and review status for every file.

Derivatives in 16:9, 4:5, and 9:16 begin only after those 30 base artifacts pass human visual review.

---

## Task 1: Define the single manifest contract and write the three research dossiers

**Files:**

- Create: `docs/commercial-studies/real-brands/README.md`
- Create: `docs/commercial-studies/real-brands/manifest.json`
- Create: `docs/commercial-studies/real-brands/nike.md`
- Create: `docs/commercial-studies/real-brands/mtv.md`
- Create: `docs/commercial-studies/real-brands/absolut.md`
- Create: `app/scripts/lib/commercial-studies.ts`
- Create: `app/scripts/lib/commercial-studies.test.ts`

**Shared contract:**

```ts
import { z } from "zod";

export const COMMERCIAL_STUDY_SLUGS = ["nike", "mtv", "absolut"] as const;
export const COMMERCIAL_STUDY_DISCLAIMER =
  "Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.";

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  author: z.string().min(1),
  url: z.string().url(),
  accessedAt: z.string().date(),
  purpose: z.string().min(1),
  usageStatus: z.enum(["approved", "review_required", "blocked"]),
  exactAssetAllowed: z.boolean(),
});

const captureSchema = z.object({
  id: z.string().min(1),
  brand: z.enum(COMMERCIAL_STUDY_SLUGS),
  stage: z.enum(["context", "training", "direction", "results", "decision"]),
  routeKey: z.string().min(1),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  waitFor: z.string().min(1),
  output: z.string().endsWith(".png"),
});

export const commercialStudiesManifestSchema = z.object({
  version: z.literal(1),
  environment: z.literal("development"),
  disclaimer: z.literal(COMMERCIAL_STUDY_DISCLAIMER),
  studies: z.array(z.object({
    slug: z.enum(COMMERCIAL_STUDY_SLUGS),
    brand: z.string().min(1),
    campaign: z.string().min(1),
    hypothesis: z.string().min(1),
    dossier: z.string().endsWith(".md"),
    sources: z.array(sourceSchema).min(2),
  })).length(3),
  captures: z.array(captureSchema).length(24),
});

export type CommercialStudiesManifest = z.infer<typeof commercialStudiesManifestSchema>;
export function loadCommercialStudiesManifest(filePath: string): CommercialStudiesManifest;
export function validateCommercialStudiesManifest(manifest: CommercialStudiesManifest): void;
```

- [ ] Add one failing Vitest file covering the cross-field rules that Zod alone does not express: each slug occurs once; each brand has 5 desktop captures at 1440×1000; each brand has mobile captures for `training`, `results`, and `decision` at 390×844; capture IDs and output paths are unique; `exactAssetAllowed` is false unless `usageStatus === "approved"`; and the disclaimer equals the canonical sentence.
- [ ] Run `cd app && npm test -- scripts/lib/commercial-studies.test.ts`; expect failure because the module and manifest do not exist.
- [ ] Implement `commercial-studies.ts` with `readFileSync`, `JSON.parse`, the Zod schema, and one `validateCommercialStudiesManifest` loop. Do not add a repository, class, or generic manifest framework.
- [ ] Create `manifest.json` with exactly three studies and 24 capture declarations. Use stable route keys rather than runtime UUIDs: `brandTraining`, `creativeWork`, and `library`. Runtime routes belong in the generated resolved manifest from Task 2.
- [ ] Set all source records to `review_required` initially unless the source itself explicitly supplies reusable-asset terms that have been reviewed. A source being publicly visible is not enough to mark an exact asset approved.
- [ ] Write the Nike dossier around the 1988 `Just Do It` system. Record at minimum Nike's official history and the Smithsonian object record; distinguish the verbal principle from the restricted Swoosh, historical ad images, and athlete likenesses.
- [ ] Write the MTV dossier around the 1981 Manhattan Design identity. Record at minimum Fred Seibert's first-person logo history and ID archive; distinguish the stable `M/TV` structure from restricted logo artwork, music, animation, and archived frames.
- [ ] Write the Absolut dossier around `Absolut Perfection` and the bottle-centered system. Record at minimum The Absolut Company history and Spritmuseum collection; treat the exact bottle silhouette, label, photographs, ads, and commissioned art as separate assets with separate usage decisions.
- [ ] In every dossier include: delimited study question; source table; observed constants; mutable elements; voice rules; prohibited inferences; asset-use table; and the canonical non-affiliation disclaimer.
- [ ] Use these verified starting sources; add further sources only when they materially resolve a rule or an asset right:

```text
Nike official history:
https://about.nike.com/en-GB/newsroom/releases/nike-reintroduces-just-do-it-to-todays-generation-with-why-do-it-campaign

Smithsonian Nike object record:
https://americanhistory.si.edu/it/collections/object/nmah_881602

MTV first creative director's logo history:
https://fredseibert.com/post/68774160/mtv-music-television-the-logo/amp

MTV network ID archive:
https://fredseibert.com/post/68726321/the-mtv-network-ids

Absolut brand history:
https://www.absolut.com/en-us/blog/vodka-and-spirits/the-story-of-the-absolut-bottle-and-brand/

Spritmuseum collection:
https://spritmuseum.se/en/collections/absolut-art-collection/
```

- [ ] Add the Brazilian legal-review references already approved in the design spec to `README.md`; describe them as review inputs, not blanket authorization.
- [ ] Run the focused test; expect pass.
- [ ] Commit only the contract and research files:

```bash
git add app/scripts/lib/commercial-studies.ts app/scripts/lib/commercial-studies.test.ts \
  docs/commercial-studies/real-brands/README.md \
  docs/commercial-studies/real-brands/manifest.json \
  docs/commercial-studies/real-brands/nike.md \
  docs/commercial-studies/real-brands/mtv.md \
  docs/commercial-studies/real-brands/absolut.md
git commit -m "docs: define real-brand study dossiers"
```

---

## Task 2: Add one dev-only, idempotent lab seed

**Files:**

- Create: `app/scripts/seed-commercial-brand-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.test.ts`
- Modify: `app/package.json`

**Reuse:** Copy the dedicated-account/workspace, synthetic asset, Brand Kit, approved-reference, identity snapshot, and controlled-output patterns from `app/scripts/seed-create-post-e2e.ts`. Call the existing repositories; do not recreate them.

**Environment guard:**

```ts
export function assertCommercialStudiesSeedEnvironment(environment = process.env): void {
  const local = environment.NODE_ENV !== "production";
  const explicitlyEnabled = environment.COMMERCIAL_STUDIES_SEED === "true";
  const safeEmail = (environment.COMMERCIAL_STUDIES_EMAIL ?? "").endsWith("@example.test");
  if (!local || !explicitlyEnabled || !safeEmail) {
    throw new Error("Commercial studies seed is development-only and requires an @example.test account");
  }
}
```

**Generated runtime record:**

```ts
type ResolvedCommercialStudies = {
  sourceManifest: string;
  generatedAt: string;
  account: { email: string; userId: string; workspaceId: string };
  studies: Record<"nike" | "mtv" | "absolut", {
    clientProfileId: string;
    creativeWorkId: string;
    selectedControlledOutputIds: string[];
    routes: { brandTraining: string; creativeWork: string; library: string };
  }>;
};
```

- [ ] Extend the existing test file with a failing test for the environment guard: production rejects; missing opt-in rejects; non-`example.test` email rejects; explicit local fixture passes.
- [ ] Add a failing pure test for stable ownership: `ownedProfileName("nike")` returns `Estudo editorial — Nike — Just Do It`, and the three expected names are unique.
- [ ] Run `cd app && npm test -- scripts/lib/commercial-studies.test.ts`; expect the new assertions to fail.
- [ ] Implement the guard and stable profile-name helper in the shared module.
- [ ] Implement `seed-commercial-brand-studies.ts` with the following sequence:

```ts
assertCommercialStudiesSeedEnvironment();
const manifest = loadCommercialStudiesManifest(manifestPath);
const account = await resolveDedicatedLabWorkspace();
await clearOnlyOwnedStudyProfiles(account.workspaceId, COMMERCIAL_STUDY_SLUGS);
for (const study of manifest.studies) {
  await seedStudy(account, study);
}
await writeResolvedManifest(account, seededStudies);
```

- [ ] Resolve or create one dedicated account from `COMMERCIAL_STUDIES_EMAIL` and `COMMERCIAL_STUDIES_PASSWORD`; create an owner workspace only for that account. Do not add billing grants and do not call `seed-dev-admin.ts`, whose credit grant is not idempotent.
- [ ] Name the dedicated workspace `ADScale — Estudos Editoriais` and verify both its owner email and name before deleting any prior seed data.
- [ ] Delete only the three exact owned client-profile names in that verified workspace. Let existing foreign-key cascades remove their training references and Creative Works. Never delete all profiles from an arbitrary workspace.
- [ ] Create one client profile per study with `createClientProfile`, then populate its current Brand Kit through `upsertBrandKit`. Derive prose from the dossier; do not invent claims that are absent from the dossier.
- [ ] Create neutral synthetic fixture images with Sharp for controlled UI states. They may carry the study slug and fixture status but may not reproduce restricted logos, ads, athlete likenesses, Absolut artwork, or protected campaign photography.
- [ ] Upload each fixture through `objectStorage` and register it with `createWorkspaceAsset`.
- [ ] Insert approved training references using the current `clientReferences` columns (`trainingCategory`, `usageMode`, `trainingAnalysis`, `reviewStatus`, `reviewedAt`, `reviewedByUserId`) as demonstrated by `seed-create-post-e2e.ts`. Only synthetic fixtures and source assets whose manifest status is `approved` may receive `reviewStatus: "approved"`.
- [ ] Create one Creative Work per brand with `createCreativeWork`; use format `4:5`, store copy through `setCreativeWorkCopy`, create and confirm the current identity snapshot, then create three controlled outputs using the existing controlled-fixture pattern.
- [ ] Mark controlled provenance explicitly in output metadata and in the resolved manifest. Store no `provider: real` label and no paid cost for these outputs.
- [ ] Write `docs/commercial-studies/real-brands/evidence/resolved-manifest.json`. It contains runtime UUIDs and routes but no password, session, API key, or cookie.
- [ ] Write one controlled replay input per brand under `docs/commercial-studies/real-brands/evidence/replay/<brand>.json`, following `app/tests/fixtures/brand-consistency/fixtures.json`: version 1, `provenance.source: "synthetic_fixture"`, three requests covering 1:1/4:5/9:16 and the three current content patterns, plus dossier-derived `replay.brief` and `replay.copy`. These files drive technical consistency checks only.
- [ ] Add package scripts:

```json
"seed:commercial-brand-studies": "NODE_OPTIONS='--conditions=react-server' tsx scripts/seed-commercial-brand-studies.ts",
"validate:commercial-brand-studies": "NODE_OPTIONS='--conditions=react-server' tsx scripts/package-commercial-brand-studies.ts --validate-only",
"capture:commercial-brand-studies": "tsx scripts/capture-ui-screenshots.ts --commercial-studies"
```

  The package script target is created in Task 4; until then only run the seed script directly.
- [ ] Run the focused test; expect pass.
- [ ] With a disposable local database and object store, run the seed twice using the same account. Expect exactly three owned profiles, three Creative Works, no duplicate training references, and stable counts after the second run.

```bash
cd app
COMMERCIAL_STUDIES_SEED=true \
COMMERCIAL_STUDIES_EMAIL=commercial-studies@example.test \
COMMERCIAL_STUDIES_PASSWORD='<local-only-password>' \
npm run seed:commercial-brand-studies
```

- [ ] Inspect `resolved-manifest.json`; confirm it contains three different profile/work IDs and no secret values.
- [ ] Commit source changes and the sanitized resolved manifest separately from any generated binary fixture:

```bash
git add app/scripts/seed-commercial-brand-studies.ts \
  app/scripts/lib/commercial-studies.ts app/scripts/lib/commercial-studies.test.ts \
  app/package.json docs/commercial-studies/real-brands/evidence/resolved-manifest.json
git commit -m "feat: seed real-brand editorial studies"
```

---

## Task 3: Add manifest-driven commercial capture to the existing screenshot script

**Files:**

- Modify: `app/scripts/capture-ui-screenshots.ts`
- Modify: `app/scripts/lib/commercial-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.test.ts`

**Capture-mode contract:**

```ts
export type ResolvedCapture = {
  id: string;
  brand: "nike" | "mtv" | "absolut";
  stage: "context" | "training" | "direction" | "results" | "decision";
  route: string;
  viewport: { width: number; height: number };
  waitFor: string;
  output: string;
};

export function resolveCommercialCaptures(
  manifest: CommercialStudiesManifest,
  runtime: ResolvedCommercialStudies,
): ResolvedCapture[];
```

- [ ] Add a failing test that resolves all 24 captures from a small runtime fixture, rejects a missing route key, and proves output paths cannot escape `docs/commercial-studies/real-brands/screenshots` via `..` or absolute paths.
- [ ] Run `cd app && npm test -- scripts/lib/commercial-studies.test.ts`; expect failure.
- [ ] Implement the resolver in the shared module using `path.resolve` plus a parent-directory check. Do not add a general workflow/action DSL.
- [ ] Preserve the current no-argument behavior of `capture-ui-screenshots.ts` exactly. Branch only when `process.argv.includes("--commercial-studies")`.
- [ ] In commercial mode, read the source and resolved manifests, authenticate with `COMMERCIAL_STUDIES_EMAIL` and `COMMERCIAL_STUDIES_PASSWORD`, and iterate the 24 resolved captures.
- [ ] Before each capture set its declared viewport, navigate to its resolved product route, wait for its declared stable selector, disable motion, and wait for fonts. Keep the existing `captureRoute` error isolation so one broken route does not erase successful captures.
- [ ] Inject the canonical disclaimer as a fixed, high-contrast capture-only footer before `page.screenshot`. Mark it `data-commercial-study-disclaimer`; do not modify product components or conceal product controls.
- [ ] For routes that rely on the active client profile, set the existing client-profile state through the same UI/storage mechanism already used by the product before navigation. Do not add a product query parameter solely for screenshots.
- [ ] Write `docs/commercial-studies/real-brands/screenshots/INDEX.json` with capture time, route, viewport, output path, and status. Return exit code 1 when any of the 24 declared captures errors or skips.
- [ ] Run the focused test; expect pass.
- [ ] Start the local app with the seeded local database and run:

```bash
cd app
E2E_BASE_URL=http://localhost:3000 \
COMMERCIAL_STUDIES_EMAIL=commercial-studies@example.test \
COMMERCIAL_STUDIES_PASSWORD='<local-only-password>' \
npm run capture:commercial-brand-studies
```

  Expect `Captured 24 screenshots (0 skipped, 0 errors)` and an index with 15 desktop plus 9 mobile records.
- [ ] Open at least one desktop and one mobile capture per brand. Confirm the intended brand profile, stage, product chrome, footer disclaimer, and legible viewport are present.
- [ ] Run `graphify update .`.
- [ ] Commit only the source and screenshot index, not provisional PNGs or incidental graph cache updates:

```bash
git add app/scripts/capture-ui-screenshots.ts app/scripts/lib/commercial-studies.ts \
  app/scripts/lib/commercial-studies.test.ts \
  docs/commercial-studies/real-brands/screenshots/INDEX.json
git commit -m "feat: capture manifest-driven brand studies"
```

---

## Task 4: Package evidence and enforce provenance honestly

**Files:**

- Create: `app/scripts/package-commercial-brand-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.test.ts`
- Modify: `docs/commercial-studies/real-brands/README.md`

**Evidence result:**

```ts
type CommercialStudyArtifact = {
  id: string;
  brand: "nike" | "mtv" | "absolut";
  kind: "desktop" | "mobile" | "isolated_result";
  path: string;
  sha256: string;
  width: number;
  height: number;
  provenance: "controlled" | "real";
  providerEvidencePath: string | null;
  visualReview: "pending" | "approved" | "rejected";
  editorialReview: "pending" | "approved" | "rejected";
  legalReview: "pending" | "approved" | "rejected";
};
```

- [ ] Add failing tests for the packaging gate: a `real` artifact without provider evidence fails; evidence naming `e2e-controlled-image` cannot satisfy real provenance; wrong dimensions fail; a missing disclaimer capture fails; duplicate path/hash records fail; and an exact source asset with non-approved usage status fails.
- [ ] Run the focused test; expect failure.
- [ ] Implement `package-commercial-brand-studies.ts` with built-in `crypto.createHash`, Sharp metadata, the existing `app/scripts/lib/evidence-honesty.mjs` rules, and the existing Brand Cortex pilot-package output shape. Do not create a second evidence database or cryptographic abstraction.
- [ ] In `--validate-only` mode, validate the 24 screenshot records and any present isolated result records without copying or mutating files.
- [ ] In package mode, copy only six selected real outputs from object storage into `docs/commercial-studies/real-brands/results`, measure them, compute SHA-256, and write `docs/commercial-studies/real-brands/evidence/ARTIFACTS.json`.
- [ ] Require exactly two real output selections per brand before package mode can succeed.
- [ ] Require each selected real output to reference an existing provider evidence package with request ID, model/provider, successful stored artifact, dimensions, prompt/input hash, capture time, and cost when the provider reports one.
- [ ] Keep controlled provider JSONL evidence available for technical replay, but list controlled pieces separately and exclude them from the six isolated final results.
- [ ] Update `README.md` with the exact seed, capture, validate, and package commands plus the meaning of each independent gate.
- [ ] Run the focused test and `npm run validate:commercial-brand-studies`; expect pass for the controlled package with zero final real outputs and an explicit `real_results_pending` status, not a false completion.
- [ ] Run `graphify update .`.
- [ ] Commit only these source and runbook files, leaving incidental graph cache updates unstaged:

```bash
git add app/scripts/package-commercial-brand-studies.ts \
  app/scripts/lib/commercial-studies.ts app/scripts/lib/commercial-studies.test.ts \
  docs/commercial-studies/real-brands/README.md
git commit -m "feat: validate commercial study evidence"
```

---

## Task 5: Rehearse all three studies with controlled evidence

**Files produced, not automatically committed:**

- `docs/commercial-studies/real-brands/evidence/provider-controlled.jsonl`
- `docs/commercial-studies/real-brands/evidence/replay/*.evidence.json`
- `docs/commercial-studies/real-brands/screenshots/*.png`
- `docs/commercial-studies/real-brands/screenshots/INDEX.json`

- [ ] Run the seed twice and confirm stable counts as in Task 2.
- [ ] Enable only the local controlled provider with its existing safety gates and an explicit evidence path:

```bash
cd app
for brand in nike mtv absolut; do
  E2E_CONTROLLED_PROVIDER=true \
  E2E_PROVIDER_EVIDENCE_PATH=../docs/commercial-studies/real-brands/evidence/provider-controlled.jsonl \
  npm run validate:brand-consistency -- \
    --manifest ../docs/commercial-studies/real-brands/evidence/replay/$brand.json \
    --out ../docs/commercial-studies/real-brands/evidence/replay/$brand.evidence.json || exit 1
done
```

- [ ] Confirm the JSONL records identify `e2e-controlled-image`, contain no paid cost, and are classified as `controlled` by the package validator.
- [ ] Capture all 24 screens and run `npm run validate:commercial-brand-studies`.
- [ ] Inspect all 24 images, not only the successful count. Record per-file review notes under the screenshot index for hierarchy, readability, brand-profile isolation, selected state, disclaimer visibility, and mobile clipping.
- [ ] Correct only shared seed/capture causes. If one route is wrong because route resolution is shared, fix the resolver once rather than patching the output file.
- [ ] Repeat until the controlled rehearsal has 24 technically valid screenshots and zero unresolved visual blockers.
- [ ] Do not call a real provider or describe this rehearsal as final artwork.

**Checkpoint:** Present the controlled rehearsal, the three dossiers, exact proposed inputs, and the proposed paid-call budget to the user. Stop and wait for explicit generation approval.

---

## Task 6: Generate and select the two Nike results

**Inputs:**

- Profile: Nike `Just Do It` study.
- Initial format: 4:5.
- Initial budget: at most two paid generation calls and no paid retries.
- Excluded unless separately cleared: athlete likenesses, historical ad photography, exact Swoosh artwork, and copied campaign layouts.

- [ ] Before dispatch, show the exact brief, selected training references, usage status of every exact asset, provider/model, maximum calls, expected credits/cost, and stop condition.
- [ ] Obtain explicit approval for this Nike batch. Approval of the overall plan does not approve this spend.
- [ ] Generate through the existing Creative Work real-provider action. Do not invoke the controlled provider for this step.
- [ ] Wait for terminal delivery and stored output. A queued job or accepted request is not a completed result.
- [ ] Build the existing real-provider/Brand Cortex evidence package for every delivered candidate.
- [ ] Record failed calls and cost separately; do not create a success record for a timeout.
- [ ] Human-review candidates for: concise action-oriented voice, visual hierarchy, format fitness, absence of invented endorsement, accidental logo duplication, and similarity to a specific historical ad.
- [ ] Select exactly two outputs or reject the batch. If fewer than two pass, stop and request a separately approved retry budget.
- [ ] Add the selected output IDs and evidence paths to the resolved manifest; leave visual/editorial/legal statuses independent.

---

## Task 7: Generate and select the two MTV results

**Inputs:**

- Profile: MTV mutable-identity study.
- Initial format: 4:5.
- Initial budget: at most two paid generation calls and no paid retries.
- Excluded unless separately cleared: exact MTV logo artwork, archived ID frames, music, animation footage, and copied textures from a known ID.

- [ ] Before dispatch, show the exact brief, source/asset statuses, provider/model, maximum calls, expected credits/cost, and stop condition.
- [ ] Obtain explicit approval for this MTV batch.
- [ ] Generate through the existing real-provider Creative Work flow and wait for stored terminal outputs.
- [ ] Build real-provider evidence packages for delivered candidates; record failures honestly.
- [ ] Human-review whether the two directions differ materially in texture/attitude while preserving only the documented structural principle. Reject outputs that merely paste or counterfeit the protected logo.
- [ ] Select exactly two outputs or stop for a new retry decision.
- [ ] Add selected output IDs and evidence paths to the resolved manifest.

---

## Task 8: Generate and select the two Absolut results

**Inputs:**

- Profile: Absolut bottle-system study.
- Initial format: 4:5.
- Initial budget: at most two paid generation calls and no paid retries.
- Exact bottle silhouette or label: allowed only if its manifest asset record has been reviewed and marked `approved`; otherwise use a neutral generic object to test the compositional rule.

- [ ] Before dispatch, show the exact brief, bottle/label usage decision, selected references, provider/model, maximum calls, expected credits/cost, and stop condition.
- [ ] Obtain explicit approval for this Absolut batch.
- [ ] Generate through the existing real-provider Creative Work flow and wait for stored terminal outputs.
- [ ] Build real-provider evidence packages; record failures and paid cost independently.
- [ ] Human-review preservation of the object, reserved composition, variation without repetition, label integrity when authorized, and absence of copied Absolut art/ads.
- [ ] Select exactly two outputs or stop for a new retry decision.
- [ ] Add selected output IDs and evidence paths to the resolved manifest.

---

## Task 9: Capture the final base package and perform the four independent reviews

**Files:**

- Update: `docs/commercial-studies/real-brands/evidence/resolved-manifest.json`
- Create after approval: `docs/commercial-studies/real-brands/evidence/ARTIFACTS.json`
- Create after approval: `docs/commercial-studies/real-brands/results/*.png`
- Create after approval: `docs/commercial-studies/real-brands/screenshots/*.png`

- [ ] Point each brand's result/decision runtime routes at the selected real-output state while leaving training and direction screens reproducible.
- [ ] Re-capture all 24 declared screens. Do not mix controlled result screenshots with real-result labels.
- [ ] Run package mode to export exactly six isolated real results and compute the 30 artifact hashes.
- [ ] Run `npm run validate:commercial-brand-studies`; expect 15 desktop, 9 mobile, 6 isolated results, zero controlled outputs among the isolated results, and zero missing evidence links.
- [ ] Technical review: verify routes, dimensions, hashes, output delivery, provider evidence, and no leaked secret/client data.
- [ ] Human visual review: inspect every desktop screen, mobile screen, and isolated result for hierarchy, legibility, cropping, loading/error residue, identity isolation, and finish. Record `approved` or `rejected` per artifact.
- [ ] Editorial review: verify each claim against its dossier and ensure the disclaimer is visible wherever the material can be detached from its parent page.
- [ ] Legal review: verify exact-asset decisions and intended publication context. Keep this status pending until a qualified reviewer records a decision.
- [ ] Re-run the validator after review-status edits. It may report the package technically complete while publication remains blocked by a pending/rejected legal or visual gate.
- [ ] Commit final approved base artifacts only after the user explicitly approves committing the image package; otherwise commit only manifests and hashes:

```bash
git add docs/commercial-studies/real-brands/evidence/resolved-manifest.json \
  docs/commercial-studies/real-brands/evidence/ARTIFACTS.json \
  docs/commercial-studies/real-brands/screenshots/INDEX.json
git commit -m "docs: record reviewed brand study package"
```

---

## Task 10: Produce derivatives only after base-package approval

**Gate:** Every one of the 30 base artifacts must have `visualReview: "approved"`; technical validation must pass; editorial review must pass; legal review must permit the intended use.

- [ ] Present the 30-artifact review table and obtain explicit user approval to derive the package.
- [ ] Use the approved desktop matrices and isolated results as the only source files. Do not regenerate artwork during layout derivation.
- [ ] Produce a 16:9 presentation with an opening disclaimer and five screens per study.
- [ ] Produce 4:5 portfolio/carousel crops that keep the function name, study label, provenance label, and disclaimer legible.
- [ ] Produce 9:16 story/demo crops that preserve the subject and do not imply a client relationship.
- [ ] Produce a web index linking each case to its dossier, sources, five stages, two selected results, and review status.
- [ ] Add derivative paths, dimensions, hashes, and parent-artifact IDs to `ARTIFACTS.json`.
- [ ] Inspect every derivative at its actual export size. A successful export command is not visual approval.
- [ ] Stop before deploy or publication and request a separate explicit approval naming the target channels.

---

## Final Verification

- [ ] Run `cd app && npm test -- scripts/lib/commercial-studies.test.ts`.
- [ ] Run `cd app && npm run validate:commercial-brand-studies`.
- [ ] Run `cd app && npm typecheck`.
- [ ] Run `graphify update .` and inspect `git status --short` for unrelated files.
- [ ] Confirm the final report separates: automated checks; controlled-provider evidence; real-provider evidence and cost; human visual approval; editorial approval; legal approval; and publication status.
- [ ] Confirm no statement calls Nike, MTV, or Absolut a client, partner, sponsor, approver, or official ADScale case.
- [ ] Confirm no paid call, retry, deployment, or publication occurred without its own explicit approval.
