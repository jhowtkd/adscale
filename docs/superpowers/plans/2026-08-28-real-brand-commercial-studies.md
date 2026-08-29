# Real-Brand Commercial Studies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an internal lab kit of 15 desktop, 9 mobile, and 6 isolated screens for Nike `Just Do It` 1988, MTV network IDs 1981–83, and Absolut Perfection 1980, with each original ad in Brand Training and only tool-generated pieces as results.

**Architecture:** One versioned editorial manifest and three dossiers around the existing product. A dev-only seed creates `estudos@example.test` / `ADScale — Estudos Editoriais`, three isolated client profiles, and uploads the original campaign files into Brand Training. The current screenshot script gains an optional manifest-driven mode. Real-provider Creative Work remains the only path for result claims. No product UI, auth role, table, provider, or second capturer.

**Tech Stack:** Next.js 16, TypeScript, Drizzle/PostgreSQL, Better Auth, Zod, Vitest, Playwright, Sharp, existing object storage, existing controlled and real image providers.

**Spec:** `docs/superpowers/specs/2026-08-28-real-brand-commercial-studies-design.md`

## Global Constraints

- Canonical disclaimer: `Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.`
- Treat Nike, MTV, and Absolut as research subjects, never as clients, partners, sponsors, or endorsements.
- Account is `estudos@example.test`. Workspace name is `ADScale — Estudos Editoriais`. No new superuser role. Use existing dev-admin only if elevated access is required.
- Do not add tables, migrations, dashboard routes, CMS screens, feature flags, providers, or a second screenshot framework.
- Do not scrape campaigns. Every original has source URL, author/publisher, access date, purpose, sha256, and a recorded usage status.
- An original enters Brand Training only when `usageStatus === "approved"` and `entersTraining === true`. Fixture images never replace an original or an isolated result.
- If the original is not visible on the training capture, the screen is rejected. If a generated piece is not readable as that campaign system, it does not enter the kit.
- Controlled-provider outputs prove loading, error, and empty gallery only.
- Paid generation ceiling: 4 dispatches per brand, then human picks 2 (one recreation, one new piece). No automatic retry. No billing credits on the study account.
- Do not perform a paid generation, paid retry, deploy, or publication without a fresh explicit approval at that checkpoint.
- This cycle does not produce 16:9, 4:5, or 9:16 derivatives and does not run legal review.
- Preserve unrelated work. Stage only paths named in each task. Never `git add .`.
- After source changes, run `graphify update .` before the corresponding final source commit.

## File Structure

| Path | Responsibility |
|---|---|
| `docs/commercial-studies/real-brands/manifest.json` | Source of truth: studies, originals, captures |
| `docs/commercial-studies/real-brands/{nike,mtv,absolut}.md` | Editorial dossiers |
| `docs/commercial-studies/real-brands/originals/` | Gitignored campaign files; README committed |
| `app/scripts/lib/commercial-studies.ts` | Zod contract, loaders, guards, capture resolver, packaging checks |
| `app/scripts/seed-commercial-brand-studies.ts` | Dev-only idempotent seed |
| `app/scripts/package-commercial-brand-studies.ts` | Evidence validation and isolated-result export |
| `app/scripts/capture-ui-screenshots.ts` | Existing capturer; `--commercial-studies` branch only |
| `docs/commercial-studies/real-brands/evidence/` | Resolved runtime IDs, hashes, review status |
| `docs/commercial-studies/real-brands/screenshots/` | 15 desktop + 9 mobile PNGs |
| `docs/commercial-studies/real-brands/results/` | 6 isolated real pieces |

---

### Task 1: Manifest contract, dossiers, and original-file gate

**Files:**

- Create: `docs/commercial-studies/real-brands/README.md`
- Create: `docs/commercial-studies/real-brands/manifest.json`
- Create: `docs/commercial-studies/real-brands/nike.md`
- Create: `docs/commercial-studies/real-brands/mtv.md`
- Create: `docs/commercial-studies/real-brands/absolut.md`
- Create: `docs/commercial-studies/real-brands/originals/README.md`
- Create: `app/scripts/lib/commercial-studies.ts`
- Create: `app/scripts/lib/commercial-studies.test.ts`
- Modify: `.gitignore`

**Interfaces:**

```ts
export const COMMERCIAL_STUDY_SLUGS = ["nike", "mtv", "absolut"] as const;
export type CommercialStudySlug = (typeof COMMERCIAL_STUDY_SLUGS)[number];
export const COMMERCIAL_STUDY_DISCLAIMER =
  "Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.";
export const COMMERCIAL_STUDY_EMAIL = "estudos@example.test";
export const COMMERCIAL_STUDY_WORKSPACE = "ADScale — Estudos Editoriais";

export function ownedProfileName(slug: CommercialStudySlug): string;
export function loadCommercialStudiesManifest(filePath: string): CommercialStudiesManifest;
export function validateCommercialStudiesManifest(manifest: CommercialStudiesManifest): void;
export function assertOriginalFiles(manifest: CommercialStudiesManifest, originalsDir: string): void;
```

- [ ] **Step 1: Write the failing test**

Create `app/scripts/lib/commercial-studies.test.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_STUDY_DISCLAIMER,
  ownedProfileName,
  loadCommercialStudiesManifest,
  validateCommercialStudiesManifest,
  assertOriginalFiles,
} from "./commercial-studies";

const validStudy = (slug: "nike" | "mtv" | "absolut", originals: unknown[]) => ({
  slug,
  brand: slug === "nike" ? "Nike" : slug === "mtv" ? "MTV" : "Absolut",
  campaign: slug === "nike" ? "Just Do It 1988" : slug === "mtv" ? "Network IDs 1981-83" : "Absolut Perfection 1980",
  hypothesis: "h",
  dossier: `${slug}.md`,
  sources: [
    {
      id: `${slug}-s1`,
      title: "t",
      publisher: "p",
      author: "a",
      url: "https://example.com/a",
      accessedAt: "2026-08-28",
      purpose: "fonte",
    },
    {
      id: `${slug}-s2`,
      title: "t2",
      publisher: "p",
      author: "a",
      url: "https://example.com/b",
      accessedAt: "2026-08-28",
      purpose: "fonte",
    },
  ],
  originals,
  briefs: {
    recreation: { theme: "Recriacao", objective: "Sistema", audience: "", offer: null },
    fresh: { theme: "Peca nova", objective: "Sistema", audience: "", offer: null },
  },
});

function capture(id: string, brand: "nike" | "mtv" | "absolut", stage: string, width: number, height: number) {
  return {
    id,
    brand,
    stage,
    routeKey: stage === "training" || stage === "context" ? "brandTraining" : stage === "direction" ? "creativeWork" : "library",
    viewport: { width, height },
    waitFor: "main",
    output: `${brand}-${stage}-${width}.png`,
  };
}

function twentyFourCaptures() {
  const stages = ["context", "training", "direction", "results", "decision"] as const;
  const mobile = new Set(["training", "results", "decision"]);
  const out = [];
  for (const brand of ["nike", "mtv", "absolut"] as const) {
    for (const stage of stages) {
      out.push(capture(`${brand}-${stage}-desktop`, brand, stage, 1440, 1000));
      if (mobile.has(stage)) out.push(capture(`${brand}-${stage}-mobile`, brand, stage, 390, 844));
    }
  }
  return out;
}

describe("commercial studies contract", () => {
  it("names isolated lab profiles", () => {
    expect(ownedProfileName("nike")).toBe("Estudo editorial — Nike — Just Do It");
    expect(ownedProfileName("mtv")).toBe("Estudo editorial — MTV — Network IDs");
    expect(ownedProfileName("absolut")).toBe("Estudo editorial — Absolut — Perfection");
  });

  it("rejects training originals that are not approved", () => {
    const manifest = {
      version: 1,
      environment: "development",
      disclaimer: COMMERCIAL_STUDY_DISCLAIMER,
      studies: [
        validStudy("nike", [
          { id: "n1", fileName: "n1.jpg", sha256: "a".repeat(64), role: "campaign_original", usageStatus: "review_required", entersTraining: true },
          { id: "n2", fileName: "n2.jpg", sha256: "b".repeat(64), role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("mtv", [
          { id: "m1", fileName: "m1.jpg", sha256: "c".repeat(64), role: "campaign_original", usageStatus: "approved", entersTraining: true },
          { id: "m2", fileName: "m2.jpg", sha256: "d".repeat(64), role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("absolut", [
          { id: "a1", fileName: "a1.jpg", sha256: "e".repeat(64), role: "campaign_original", usageStatus: "approved", entersTraining: true },
        ]),
      ],
      captures: twentyFourCaptures(),
    };
    expect(() => validateCommercialStudiesManifest(manifest as never)).toThrow(/entersTraining/);
  });

  it("requires original files to match sha256", () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-orig-"));
    writeFileSync(join(dir, "ok.jpg"), "hello");
    const sha = createHash("sha256").update("hello").digest("hex");
    const manifest = {
      version: 1,
      environment: "development",
      disclaimer: COMMERCIAL_STUDY_DISCLAIMER,
      studies: [
        validStudy("nike", [
          { id: "n1", fileName: "ok.jpg", sha256: sha, role: "campaign_original", usageStatus: "approved", entersTraining: true },
          { id: "n2", fileName: "missing.jpg", sha256: "f".repeat(64), role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("mtv", [
          { id: "m1", fileName: "ok.jpg", sha256: sha, role: "campaign_original", usageStatus: "approved", entersTraining: true },
          { id: "m2", fileName: "ok.jpg", sha256: sha, role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("absolut", [
          { id: "a1", fileName: "ok.jpg", sha256: sha, role: "campaign_original", usageStatus: "approved", entersTraining: true },
        ]),
      ],
      captures: twentyFourCaptures(),
    };
    validateCommercialStudiesManifest(manifest as never);
    expect(() => assertOriginalFiles(manifest as never, dir)).toThrow(/missing.jpg/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: FAIL because `./commercial-studies` is not defined.

- [ ] **Step 3: Implement the module**

Create `app/scripts/lib/commercial-studies.ts` with `readFileSync`, `JSON.parse`, Zod, and these cross-field checks in `validateCommercialStudiesManifest`:

- `disclaimer === COMMERCIAL_STUDY_DISCLAIMER`
- each slug occurs once; array length 3
- nike originals length >= 2; mtv 2–3; absolut >= 1
- `entersTraining` requires `usageStatus === "approved"`
- each study has >= 1 original with `entersTraining === true`
- 24 captures; each brand has 5 desktop at 1440×1000; mobile only for `training`, `results`, `decision` at 390×844
- capture ids and output paths unique; output is a basename ending in `.png` with no `/` or `..`
- `ownedProfileName` returns the three exact strings above

`assertOriginalFiles` reads `join(originalsDir, fileName)`, hashes with `createHash("sha256")`, throws if missing or mismatch.

`loadCommercialStudiesManifest` parses JSON then calls `validateCommercialStudiesManifest`.

Do not add a repository, class, or generic manifest framework.

- [ ] **Step 4: Add gitignore and originals README**

Append to `.gitignore`:

```
docs/commercial-studies/real-brands/originals/*
!docs/commercial-studies/real-brands/originals/README.md
docs/commercial-studies/real-brands/screenshots/*.png
docs/commercial-studies/real-brands/results/*.png
```

`originals/README.md` must say: drop the campaign files locally; do not scrape; do not commit binaries; seed refuses to run until sha256 matches `manifest.json`.

- [ ] **Step 5: Write manifest, dossiers, and README**

`manifest.json` version 1, environment `development`, canonical disclaimer, three studies, 24 captures.

Capture `routeKey` values: `brandTraining` for context and training; `creativeWork` for direction; `library` for results and decision.

`waitFor` is `main` for every capture except training, which uses `img[alt]`. Do not add product attributes for screenshots.

Original slots (hashes filled in Step 6 after files exist; until then use the real file sha256 you compute, never a fake approved hash for a missing file):

Nike files: `nike-just-do-it-1988-print.jpg`, `nike-walt-stack-1988-frame.jpg`
MTV files: `mtv-id-1981-a.jpg`, `mtv-id-1981-b.jpg` (optional third `mtv-id-1981-c.jpg`)
Absolut file: `absolut-perfection-1980.jpg`

All training originals `usageStatus: "approved"`, `entersTraining: true`, purpose `internal_lab_training`.

Sources (copy verbatim):

```text
Nike Smithsonian: https://americanhistory.si.edu/it/collections/object/nmah_881602
Nike campaign recap: https://medium.com/@scott_10846/happy-birthday-just-do-it-fc37c6ec4862
Nike spot: https://youtu.be/0yO7xLAGugQ
MTV IDs: https://fredseibert.com/post/68726321/the-mtv-network-ids
MTV logo history: https://fredseibert.com/post/68774160/mtv-music-television-the-logo/amp
Absolut series: https://www.businessinsider.com/the-21-best-absolut-ads-2013-12
Absolut bottle: https://www.absolut.com/en-us/blog/vodka-and-spirits/the-story-of-the-absolut-bottle-and-brand/
```

Each dossier includes: delimited question; source table; constants; mutable elements; voice rules; prohibited inferences (Walt Stack likeness; MTV music/clips; Absolut halo copy); asset-use table; canonical disclaimer.

Briefs in the manifest:

- Nike recreation theme `Just Do It 1988 — sistema da ponte`; objective `Recriar o sistema verbal e a composicao, sem o rosto de Walt Stack`; offer null
- Nike fresh theme `Just Do It — peca nova no mesmo idioma`; objective `Nova peca com a mesma voz curta`
- MTV recreation theme `Network ID — esqueleto M/TV`; objective `Recriar um ID, nao um logo estatico`
- MTV fresh theme `Network ID — outra pele`; objective `Mesmo esqueleto, pele nova`
- Absolut recreation theme `Absolut Perfection`; objective `Recriar garrafa, holofote e duas palavras`
- Absolut fresh theme `Absolut ______`; objective `Nova peca no sistema, sem copiar o halo`

- [ ] **Step 6: Place originals and lock hashes**

Obtain the files locally without scraping a corpus. Compute sha256:

```bash
shasum -a 256 docs/commercial-studies/real-brands/originals/*
```

Write those hashes into `manifest.json`. If a file cannot be obtained with internal-lab use recorded, remove that brand from this cycle rather than seeding a fixture. Do not commit the binaries.

- [ ] **Step 7: Run tests**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: PASS.

Also run a one-off node import that loads the real manifest and `assertOriginalFiles` against `docs/commercial-studies/real-brands/originals`. Expected: no throw.

- [ ] **Step 8: Commit**

```bash
git add app/scripts/lib/commercial-studies.ts app/scripts/lib/commercial-studies.test.ts \
  docs/commercial-studies/real-brands/README.md \
  docs/commercial-studies/real-brands/manifest.json \
  docs/commercial-studies/real-brands/nike.md \
  docs/commercial-studies/real-brands/mtv.md \
  docs/commercial-studies/real-brands/absolut.md \
  docs/commercial-studies/real-brands/originals/README.md \
  .gitignore
git commit -m "docs: define real-brand study dossiers and original-file gate"
```

---

### Task 2: Dev-only idempotent lab seed

**Files:**

- Create: `app/scripts/seed-commercial-brand-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.test.ts`
- Modify: `app/package.json`

**Consumes:** Task 1 loaders and `ownedProfileName`.

**Produces:**

```ts
export function assertCommercialStudiesSeedEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void;

export type ResolvedCommercialStudies = {
  sourceManifest: string;
  generatedAt: string;
  account: { email: string; userId: string; workspaceId: string };
  studies: Record<CommercialStudySlug, {
    clientProfileId: string;
    creativeWorkId: string;
    freshBrief: { theme: string; objective: string; audience: string; offer: string | null };
    trainingReferenceIds: string[];
    originalAssetKeys: string[];
    selectedRealOutputIds: string[];
    routes: {
      brandTraining: "/brand-kit";
      creativeWork: string;
      library: "/library";
    };
  }>;
};
```

Copy account/workspace, upload, Brand Kit, reference insert, identity snapshot, and Creative Work patterns from `app/scripts/seed-create-post-e2e.ts`. Call existing repositories. Do not recreate them. Do not call `seed-dev-admin.ts`. Do not grant credits.

- [ ] **Step 1: Write the failing environment tests**

Add to `commercial-studies.test.ts`:

```ts
import { assertCommercialStudiesSeedEnvironment } from "./commercial-studies";

it("rejects production, missing opt-in, and non-lab email", () => {
  expect(() => assertCommercialStudiesSeedEnvironment({
    NODE_ENV: "production",
    COMMERCIAL_STUDIES_SEED: "true",
    COMMERCIAL_STUDIES_EMAIL: "estudos@example.test",
  })).toThrow(/development-only/);
  expect(() => assertCommercialStudiesSeedEnvironment({
    NODE_ENV: "development",
    COMMERCIAL_STUDIES_EMAIL: "estudos@example.test",
  })).toThrow(/development-only/);
  expect(() => assertCommercialStudiesSeedEnvironment({
    NODE_ENV: "development",
    COMMERCIAL_STUDIES_SEED: "true",
    COMMERCIAL_STUDIES_EMAIL: "person@gmail.com",
  })).toThrow(/development-only/);
});

it("allows the locked lab email in development with opt-in", () => {
  expect(() => assertCommercialStudiesSeedEnvironment({
    NODE_ENV: "development",
    COMMERCIAL_STUDIES_SEED: "true",
    COMMERCIAL_STUDIES_EMAIL: "estudos@example.test",
  })).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: FAIL because `assertCommercialStudiesSeedEnvironment` is not exported.

- [ ] **Step 3: Implement the guard**

```ts
export function assertCommercialStudiesSeedEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const local = environment.NODE_ENV !== "production";
  const explicitlyEnabled = environment.COMMERCIAL_STUDIES_SEED === "true";
  const email = environment.COMMERCIAL_STUDIES_EMAIL ?? "";
  if (!local || !explicitlyEnabled || email !== COMMERCIAL_STUDY_EMAIL) {
    throw new Error("Commercial studies seed is development-only and requires estudos@example.test");
  }
}
```

- [ ] **Step 4: Implement the seed script**

`app/scripts/seed-commercial-brand-studies.ts`:

```ts
assertCommercialStudiesSeedEnvironment();
const manifest = loadCommercialStudiesManifest(manifestPath);
assertOriginalFiles(manifest, originalsDir);
const account = await resolveDedicatedLabWorkspace();
await clearOnlyOwnedStudyProfiles(account.workspaceId);
for (const study of manifest.studies) {
  await seedStudy(account, study);
}
await writeResolvedManifest(account, seededStudies);
```

`resolveDedicatedLabWorkspace`:

- Look up `user.email === estudos@example.test`
- If missing, `auth.api.signUpEmail` with `COMMERCIAL_STUDIES_PASSWORD` and name `ADScale Estudos`
- Find or create a workspace named exactly `ADScale — Estudos Editoriais` owned by that user (same insert pattern as `seed-create-post-e2e.ts`)
- Before deleting anything, assert workspace name and owner email match

`clearOnlyOwnedStudyProfiles`:

- Delete only client profiles in that workspace whose `name` is one of the three `ownedProfileName` values
- Let foreign-key cascades remove training references and Creative Works
- Never `delete` all profiles in an arbitrary workspace

`seedStudy`:

1. `createClientProfile(workspaceId, { name: ownedProfileName(slug), description: study.hypothesis, constraints: "Estudo interno. Sem afiliacao com a marca." })`
2. `upsertBrandKit` with dossier-derived colors/fonts/voice. Do not invent claims absent from the dossier.
3. For each original with `entersTraining`: read file, `assert` sha256, `objectStorage.put` under `commercial-studies/${workspaceId.slice(0,8)}/${slug}/${fileName}`, `createWorkspaceAsset` with `source: "seed"` and metadata `{ commercialStudy: true, originalId, sha256 }`, insert `clientReferences` with `trainingCategory: "visual_reference"`, `usageMode: "reference"`, `reviewStatus: "approved"`, `reviewedAt: new Date()`, `reviewedByUserId: account.userId`, `trainingAnalysis` taken from the dossier constants/rules (confidence 1). Never upload a Sharp-generated blob as a training original.
4. `createCreativeWork` once with `toolKind: "single"`, `format: "4:5"`, brief `study.briefs.recreation`. Store `study.briefs.fresh` on the resolved record as `freshBrief` for the later paid dispatch. `setCreativeWorkCopy` with dossier headline/body/cta. `createIdentitySnapshot` with the approved original reference IDs. `confirmCreativeWorkIdentity`. Leave status `draft`. Do not create completed fake outputs. Two Peças reais are selected later from this one Trabalho (recreation dispatch + fresh dispatch).
5. Create three extra works for controlled UI only, labeled in resolved metadata as `controlledUi`: `generating` (loading), `failed` (error), `completed` with zero outputs (empty gallery). These IDs must not appear in `selectedRealOutputIds`.

Write `docs/commercial-studies/real-brands/evidence/resolved-manifest.json`. No password, session, API key, or cookie.

- [ ] **Step 5: Add package scripts**

In `app/package.json`:

```json
"seed:commercial-brand-studies": "NODE_OPTIONS='--conditions=react-server' tsx scripts/seed-commercial-brand-studies.ts",
"validate:commercial-brand-studies": "NODE_OPTIONS='--conditions=react-server' tsx scripts/package-commercial-brand-studies.ts --validate-only",
"capture:commercial-brand-studies": "tsx scripts/capture-ui-screenshots.ts --commercial-studies"
```

`validate:` target is implemented in Task 4. Until then only run the seed script.

- [ ] **Step 6: Run unit tests**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: PASS.

- [ ] **Step 7: Run the seed twice**

```bash
cd app
COMMERCIAL_STUDIES_SEED=true \
COMMERCIAL_STUDIES_EMAIL=estudos@example.test \
COMMERCIAL_STUDIES_PASSWORD='<local-only-password>' \
npm run seed:commercial-brand-studies
```

Run it a second time. Expect exactly three owned profiles, three draft study Creative Works plus nine controlled-UI works, training reference counts equal to the approved originals, and stable counts after the second run.

Inspect `resolved-manifest.json`: three different profile IDs, originalAssetKeys present, `selectedRealOutputIds` empty arrays, no secrets.

Open `/brand-kit` as `estudos@example.test` and confirm each profile shows the real original, not a colored rectangle.

- [ ] **Step 8: Commit**

```bash
git add app/scripts/seed-commercial-brand-studies.ts \
  app/scripts/lib/commercial-studies.ts app/scripts/lib/commercial-studies.test.ts \
  app/package.json docs/commercial-studies/real-brands/evidence/resolved-manifest.json
git commit -m "feat: seed real-brand editorial studies with original ads"
```

Do not stage original binaries or object-storage blobs.

---

### Task 3: Manifest-driven capture on the existing script

**Files:**

- Modify: `app/scripts/capture-ui-screenshots.ts`
- Modify: `app/scripts/lib/commercial-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.test.ts`

**Consumes:** `CommercialStudiesManifest`, `ResolvedCommercialStudies`.

**Produces:**

```ts
export type ResolvedCapture = {
  id: string;
  brand: CommercialStudySlug;
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

Route map:

- `brandTraining` → `/brand-kit`
- `creativeWork` → runtime `routes.creativeWork` (`/creative-work/${id}`)
- `library` → `/library`

- [ ] **Step 1: Write the failing resolver test**

```ts
it("resolves 24 captures and rejects path escape", () => {
  const runtime = {
    sourceManifest: "manifest.json",
    generatedAt: "2026-08-28T00:00:00.000Z",
    account: { email: "estudos@example.test", userId: "u", workspaceId: "w" },
    studies: {
      nike: { clientProfileId: "p1", creativeWorkId: "w1", freshBrief: { theme: "Peca nova", objective: "Sistema", audience: "", offer: null }, trainingReferenceIds: [], originalAssetKeys: [], selectedRealOutputIds: [], routes: { brandTraining: "/brand-kit", creativeWork: "/creative-work/w1", library: "/library" } },
      mtv: { clientProfileId: "p2", creativeWorkId: "w2", freshBrief: { theme: "Peca nova", objective: "Sistema", audience: "", offer: null }, trainingReferenceIds: [], originalAssetKeys: [], selectedRealOutputIds: [], routes: { brandTraining: "/brand-kit", creativeWork: "/creative-work/w2", library: "/library" } },
      absolut: { clientProfileId: "p3", creativeWorkId: "w3", freshBrief: { theme: "Peca nova", objective: "Sistema", audience: "", offer: null }, trainingReferenceIds: [], originalAssetKeys: [], selectedRealOutputIds: [], routes: { brandTraining: "/brand-kit", creativeWork: "/creative-work/w3", library: "/library" } },
    },
  } as const;
  const resolved = resolveCommercialCaptures(loadCommercialStudiesManifest(realManifestPath), runtime as never);
  expect(resolved).toHaveLength(24);
  expect(resolved.every((c) => c.output.endsWith(".png"))).toBe(true);
});

it("rejects output paths that escape the screenshot directory", () => {
  expect(() => assertCaptureOutputPath("../x.png")).toThrow();
  expect(() => assertCaptureOutputPath("/tmp/x.png")).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: FAIL because `resolveCommercialCaptures` is missing.

- [ ] **Step 3: Implement resolver and path guard**

`assertCaptureOutputPath` joins `docs/commercial-studies/real-brands/screenshots` with the basename and throws if `path.relative(root, resolved)` starts with `..` or is absolute.

- [ ] **Step 4: Branch the existing capturer**

Preserve no-argument behavior of `capture-ui-screenshots.ts` exactly. Branch only when `process.argv.includes("--commercial-studies")`.

Commercial mode:

1. Load source manifest and `docs/commercial-studies/real-brands/evidence/resolved-manifest.json`
2. Login with `COMMERCIAL_STUDIES_EMAIL` / `COMMERCIAL_STUDIES_PASSWORD` using the existing `login()` helper
3. For each resolved capture: `page.setViewportSize(viewport)`; set `adscale-storage` localStorage to `{ state: { activeClientProfileId: study.clientProfileId, sidebarCollapsed: false }, version: 0 }` before navigation; `goto` the route; `waitForSelector(waitFor)`; disable motion; wait for fonts
4. Context stage only: inject a capture-only header (`data-commercial-study-context`) with campaign, hypothesis, source title, and the canonical disclaimer. Do not modify product components.
5. Every stage: inject a capture-only footer (`data-commercial-study-disclaimer`) with the canonical disclaimer
6. Training stage: fail that capture if `page.locator(\`img[alt]\`)` count is 0
7. Keep existing per-route error isolation
8. Write `docs/commercial-studies/real-brands/screenshots/INDEX.json` with id, brand, stage, route, viewport, output, status
9. Exit 1 if any of the 24 errors or skips

- [ ] **Step 5: Run unit tests**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: PASS.

- [ ] **Step 6: Capture against local app**

Start the app on the seeded database. Then:

```bash
cd app
E2E_BASE_URL=http://localhost:3000 \
COMMERCIAL_STUDIES_EMAIL=estudos@example.test \
COMMERCIAL_STUDIES_PASSWORD='<local-only-password>' \
npm run capture:commercial-brand-studies
```

Expected: 24 files attempted. Training captures must show the original ad. Context captures must show the disclaimer. Results/decision may be empty until Task 9; INDEX must mark them honestly.

- [ ] **Step 7: Commit**

```bash
git add app/scripts/capture-ui-screenshots.ts app/scripts/lib/commercial-studies.ts \
  app/scripts/lib/commercial-studies.test.ts \
  docs/commercial-studies/real-brands/screenshots/INDEX.json
git commit -m "feat: capture manifest-driven brand studies"
```

Do not commit PNG screenshots in this task.

---

### Task 4: Evidence packaging and provenance

**Files:**

- Create: `app/scripts/package-commercial-brand-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.ts`
- Modify: `app/scripts/lib/commercial-studies.test.ts`
- Modify: `docs/commercial-studies/real-brands/README.md`

**Produces:**

```ts
export type CommercialStudyArtifact = {
  id: string;
  brand: CommercialStudySlug;
  kind: "desktop" | "mobile" | "isolated_result";
  path: string;
  sha256: string;
  width: number;
  height: number;
  provenance: "controlled" | "real";
  providerEvidencePath: string | null;
  visualReview: "pending" | "approved" | "rejected";
  editorialReview: "pending" | "approved" | "rejected";
};

export function validateCommercialStudyArtifacts(
  artifacts: CommercialStudyArtifact[],
  options: { requireRealResults: boolean },
): void;
```

- [ ] **Step 1: Write failing packaging tests**

```ts
it("fails a real artifact without provider evidence", () => {
  expect(() => validateCommercialStudyArtifacts([{
    id: "n1", brand: "nike", kind: "isolated_result", path: "results/n.png",
    sha256: "a".repeat(64), width: 1080, height: 1350, provenance: "real",
    providerEvidencePath: null, visualReview: "pending", editorialReview: "pending",
  }], { requireRealResults: true })).toThrow(/provider evidence/);
});

it("fails when a controlled output is labeled isolated_result", () => {
  expect(() => validateCommercialStudyArtifacts([{
    id: "n1", brand: "nike", kind: "isolated_result", path: "results/n.png",
    sha256: "a".repeat(64), width: 1080, height: 1350, provenance: "controlled",
    providerEvidencePath: "evidence/x.json", visualReview: "pending", editorialReview: "pending",
  }], { requireRealResults: true })).toThrow(/controlled/);
});

it("allows validate-only with zero real results and real_results_pending", () => {
  expect(() => validateCommercialStudyArtifacts([], { requireRealResults: false })).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: FAIL because `validateCommercialStudyArtifacts` is missing.

- [ ] **Step 3: Implement validator and script**

Use `crypto.createHash`, Sharp metadata, and `app/scripts/lib/evidence-honesty.mjs` `SOURCE_LABELS`. Do not create a second evidence database.

`--validate-only`: validate INDEX.json (24 rows, dimensions, unique paths). If six isolated results are absent, print `real_results_pending` and exit 0. If any isolated result is present, require provenance `real`, existing provider evidence file, and exactly two per brand.

Package mode (no `--validate-only`): copy the six selected real outputs from object storage into `docs/commercial-studies/real-brands/results`, hash them, write `docs/commercial-studies/real-brands/evidence/ARTIFACTS.json`. Fail if `selectedRealOutputIds` length is not 2 per brand.

Reject evidence files whose provider name is `e2e-controlled-image` for `provenance: "real"`.

- [ ] **Step 4: Document commands in README**

Seed, capture, validate, package. State that controlled rehearsal is not final artwork. State that paid batches need per-brand approval.

- [ ] **Step 5: Run tests and validate-only**

Run: `cd app && npm test -- scripts/lib/commercial-studies.test.ts`

Expected: PASS.

Run: `cd app && npm run validate:commercial-brand-studies`

Expected: PASS with `real_results_pending`.

- [ ] **Step 6: Commit**

```bash
git add app/scripts/package-commercial-brand-studies.ts \
  app/scripts/lib/commercial-studies.ts app/scripts/lib/commercial-studies.test.ts \
  docs/commercial-studies/real-brands/README.md
git commit -m "feat: validate commercial study evidence"
```

---

### Task 5: Controlled rehearsal, then stop

**Files produced, not automatically committed:**

- `docs/commercial-studies/real-brands/screenshots/*.png`
- `docs/commercial-studies/real-brands/screenshots/INDEX.json`

- [ ] Re-run the seed twice; confirm stable profile and work counts from Task 2.
- [ ] Capture all 24 screens.
- [ ] Run `cd app && npm run validate:commercial-brand-studies`. Expect `real_results_pending`.
- [ ] Inspect every training PNG. If the original ad is missing, reject that capture and fix seed/waitFor. Do not substitute a fixture.
- [ ] Inspect context PNGs for the canonical disclaimer.
- [ ] Record loading/error/empty captures as controlled in INDEX notes.
- [ ] Do not call a real provider.

**Checkpoint:** Present the three dossiers, training captures, exact recreation/fresh briefs, provider/model, and the paid budget (max 4 dispatches per brand, pick 2). Stop. Plan approval does not approve spend.

---

### Task 6: Nike paid batch

**Inputs:** profile `Estudo editorial — Nike — Just Do It`. Format `4:5`. Ceiling 4 `POST /api/creative-work/:id/generate` dispatches. Pick 1 recreation output and 1 fresh output. No paid retries. Excluded: Walt Stack likeness, exact Swoosh as a pasted logo, copied campaign photography.

One `POST /api/creative-work/:id/generate` with `action: "initial"` is 1 dispatch even if conservative/balanced/bold candidates appear. Recommended path on the single Nike Trabalho: 1 initial dispatch using `briefs.recreation`, then 1 revision dispatch (`action: "revision"`) using `briefs.fresh` as `instruction` (2 of 4). Leave the remaining 2 unused unless a new approval is given.

- [ ] Show brief, training reference ids, usageMode `reference`, provider/model, max calls, expected credits, stop condition.
- [ ] Obtain explicit approval for this Nike batch.
- [ ] Generate through the existing Creative Work real-provider action on `studies.nike.creativeWorkId` while logged in as `estudos@example.test`. Do not use the controlled provider.
- [ ] Wait for stored terminal outputs. A 202 or queued job is not delivery.
- [ ] Store provider evidence (request id, model, artifact, dimensions, prompt hash, time, cost if reported) under `docs/commercial-studies/real-brands/evidence/nike/`.
- [ ] Record failures without inventing success.
- [ ] Human-select exactly two outputs that read as the Just Do It system, or reject the batch.
- [ ] Write the two output IDs into `resolved-manifest.json` `studies.nike.selectedRealOutputIds`.

---

### Task 7: MTV paid batch

**Inputs:** profile `Estudo editorial — MTV — Network IDs`. Format `4:5`. Ceiling 4 dispatches. Pick 1 recreation ID and 1 new-skin ID. No music clip. Do not paste the protected logo as a static mark.

- [ ] Show brief, training stills, provider/model, max calls, expected credits, stop condition.
- [ ] Obtain explicit approval for this MTV batch.
- [ ] Generate on `studies.mtv.creativeWorkId`: initial with `briefs.recreation`, then revision with `briefs.fresh` as `instruction`. Wait for stored outputs.
- [ ] Store evidence under `docs/commercial-studies/real-brands/evidence/mtv/`.
- [ ] Human-select two outputs that keep M/TV structure with different skins, or reject the batch.
- [ ] Write IDs into `studies.mtv.selectedRealOutputIds`.

---

### Task 8: Absolut paid batch

**Inputs:** profile `Estudo editorial — Absolut — Perfection`. Format `4:5`. Ceiling 4 dispatches. Pick 1 Perfection recreation and 1 `Absolut ______` new piece. New piece must not copy the 1980 halo.

- [ ] Show brief, bottle usageMode `reference`, provider/model, max calls, expected credits, stop condition.
- [ ] Obtain explicit approval for this Absolut batch.
- [ ] Generate on `studies.absolut.creativeWorkId`: initial with `briefs.recreation`, then revision with `briefs.fresh` as `instruction`. Wait for stored outputs.
- [ ] Store evidence under `docs/commercial-studies/real-brands/evidence/absolut/`.
- [ ] Human-select two outputs that read as the bottle system, or reject the batch.
- [ ] Write IDs into `studies.absolut.selectedRealOutputIds`.

---

### Task 9: Final 15+9+6 package and internal review

**Files:**

- Update: `docs/commercial-studies/real-brands/evidence/resolved-manifest.json`
- Create: `docs/commercial-studies/real-brands/evidence/ARTIFACTS.json`
- Create: `docs/commercial-studies/real-brands/results/*.png`
- Update: `docs/commercial-studies/real-brands/screenshots/INDEX.json`

- [ ] Recapture all 24 screens against the real selected outputs. Results and decision must show the generated pieces, not empty gallery.
- [ ] Run package mode to export exactly six isolated real results.
- [ ] Run `cd app && npm run validate:commercial-brand-studies` without `--validate-only` equivalent: expect 15 desktop, 9 mobile, 6 isolated, zero controlled isolated results, every isolated result linked to provider evidence.
- [ ] Technical review: routes, dimensions, hashes, no leaked secrets, originals still visible on training screens.
- [ ] Visual review: every desktop, mobile, and isolated file. `approved` or `rejected` per artifact. Reject if original missing from training or if a piece is not readable as that system.
- [ ] Editorial review: claims match dossiers; disclaimer visible on context.
- [ ] Do not run legal review. Do not produce 16:9/4:5/9:16. Do not deploy.
- [ ] Commit manifests and hashes. Commit PNGs only if the user explicitly asks:

```bash
git add docs/commercial-studies/real-brands/evidence/resolved-manifest.json \
  docs/commercial-studies/real-brands/evidence/ARTIFACTS.json \
  docs/commercial-studies/real-brands/screenshots/INDEX.json
git commit -m "docs: record reviewed brand study package"
```

---

## Final Verification

- [ ] `cd app && npm test -- scripts/lib/commercial-studies.test.ts`
- [ ] `cd app && npm run validate:commercial-brand-studies`
- [ ] `cd app && npm run typecheck`
- [ ] `graphify update .`
- [ ] Report separately: automated checks; controlled UI states; real-provider evidence and cost; visual review; editorial review; publication status (`not_published`).
- [ ] Confirm no statement calls Nike, MTV, or Absolut a client.
- [ ] Confirm no paid call, retry, deploy, or publication occurred without its own approval.
