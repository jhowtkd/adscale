import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

const { SOURCE_LABELS } = createRequire(__filename)("./evidence-honesty.mjs") as {
  SOURCE_LABELS: readonly string[];
};

export const COMMERCIAL_STUDY_SLUGS = ["nike", "mtv", "absolut"] as const;
export type CommercialStudySlug = (typeof COMMERCIAL_STUDY_SLUGS)[number];

export const COMMERCIAL_STUDY_DISCLAIMER =
  "Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.";
export const COMMERCIAL_STUDY_EMAIL = "estudos@example.test";
export const COMMERCIAL_STUDY_WORKSPACE = "ADScale — Estudos Editoriais";

export type LabOwnerWorkspace = {
  id: string;
  name: string;
  membershipCreatedAt: Date;
};

export function selectSignupLabWorkspace(
  ownerWorkspaces: readonly LabOwnerWorkspace[],
  labName: string = COMMERCIAL_STUDY_WORKSPACE,
): { keepId: string; rename: boolean; extraIds: string[] } {
  if (ownerWorkspaces.length === 0) {
    throw new Error("User has no workspace.");
  }
  const sorted = [...ownerWorkspaces].sort(
    (a, b) => a.membershipCreatedAt.getTime() - b.membershipCreatedAt.getTime(),
  );
  const keep = sorted[0];
  return {
    keepId: keep.id,
    rename: keep.name !== labName,
    extraIds: sorted.slice(1).map((workspace) => workspace.id),
  };
}

export type ResolvedCommercialStudies = {
  sourceManifest: string;
  generatedAt: string;
  account: { email: string; userId: string; workspaceId: string };
  studies: Record<
    CommercialStudySlug,
    {
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
      controlledUi: {
        generating: string;
        failed: string;
        empty: string;
      };
    }
  >;
};

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

const STAGES = ["context", "training", "direction", "results", "decision"] as const;
const MOBILE_STAGES = ["training", "results", "decision"] as const;
const OWNED_PROFILE_NAMES: Record<CommercialStudySlug, string> = {
  nike: "Estudo editorial — Nike — Just Do It",
  mtv: "Estudo editorial — MTV — Network IDs",
  absolut: "Estudo editorial — Absolut — Perfection",
};

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  author: z.string().min(1),
  url: z.string().url(),
  accessedAt: z.string().min(1),
  purpose: z.string().min(1),
});

const originalSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  role: z.enum(["campaign_original", "campaign_still"]),
  usageStatus: z.enum(["approved", "review_required", "blocked"]),
  entersTraining: z.boolean(),
  purpose: z.string().min(1).optional(),
});

const briefSchema = z.object({
  theme: z.string().min(1),
  objective: z.string().min(1),
  audience: z.string(),
  offer: z.string().nullable(),
});

const captureSchema = z.object({
  id: z.string().min(1),
  brand: z.enum(COMMERCIAL_STUDY_SLUGS),
  stage: z.enum(STAGES),
  routeKey: z.enum(["brandTraining", "creativeWork", "library"]),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  waitFor: z.string().min(1),
  output: z.string().min(1),
});

const commercialStudiesManifestSchema = z.object({
  version: z.literal(1),
  environment: z.literal("development"),
  disclaimer: z.literal(COMMERCIAL_STUDY_DISCLAIMER),
  studies: z
    .array(
      z.object({
        slug: z.enum(COMMERCIAL_STUDY_SLUGS),
        brand: z.string().min(1),
        campaign: z.string().min(1),
        hypothesis: z.string().min(1),
        dossier: z.string().endsWith(".md"),
        sources: z.array(sourceSchema).min(2),
        originals: z.array(originalSchema),
        briefs: z.object({
          recreation: briefSchema,
          fresh: briefSchema,
        }),
      }),
    )
    .length(3),
  captures: z.array(captureSchema).length(24),
});

export type CommercialStudiesManifest = z.infer<typeof commercialStudiesManifestSchema>;

function expectedRouteKey(stage: (typeof STAGES)[number]): "brandTraining" | "creativeWork" | "library" {
  if (stage === "context" || stage === "training") return "brandTraining";
  if (stage === "direction") return "creativeWork";
  return "library";
}

function isBasenameOnly(fileName: string): boolean {
  return !isAbsolute(fileName) && basename(fileName) === fileName && fileName !== "." && fileName !== "..";
}

function resolveOriginalFile(originalsRoot: string, fileName: string): string {
  if (!isBasenameOnly(fileName)) {
    throw new Error(`invalid original fileName ${fileName}`);
  }
  const filePath = resolve(originalsRoot, fileName);
  const rel = relative(originalsRoot, filePath);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`original path escapes originalsDir: ${fileName}`);
  }
  return filePath;
}

export function ownedProfileName(slug: CommercialStudySlug): string {
  return OWNED_PROFILE_NAMES[slug];
}

export function validateCommercialStudiesManifest(manifest: CommercialStudiesManifest): void {
  const parsed = commercialStudiesManifestSchema.parse(manifest);

  if (parsed.disclaimer !== COMMERCIAL_STUDY_DISCLAIMER) {
    throw new Error("disclaimer must equal COMMERCIAL_STUDY_DISCLAIMER");
  }

  const slugs = parsed.studies.map((study) => study.slug);
  if (new Set(slugs).size !== COMMERCIAL_STUDY_SLUGS.length) {
    throw new Error("each study slug must occur once");
  }

  for (const study of parsed.studies) {
    const count = study.originals.length;
    if (study.slug === "nike" && count < 2) {
      throw new Error("nike originals length must be >= 2");
    }
    if (study.slug === "mtv" && (count < 2 || count > 3)) {
      throw new Error("mtv originals length must be 2-3");
    }
    if (study.slug === "absolut" && count < 1) {
      throw new Error("absolut originals length must be >= 1");
    }

    for (const original of study.originals) {
      if (!isBasenameOnly(original.fileName)) {
        throw new Error(`invalid original fileName ${original.fileName}`);
      }
      if (original.entersTraining && original.usageStatus !== "approved") {
        throw new Error("entersTraining requires usageStatus approved");
      }
    }
  }

  if (parsed.captures.length !== 24) {
    throw new Error("captures length must be 24");
  }

  const captureIds = new Set<string>();
  const outputs = new Set<string>();
  for (const capture of parsed.captures) {
    if (captureIds.has(capture.id)) {
      throw new Error(`duplicate capture id ${capture.id}`);
    }
    captureIds.add(capture.id);
    if (outputs.has(capture.output)) {
      throw new Error(`duplicate capture output ${capture.output}`);
    }
    outputs.add(capture.output);
    if (
      capture.output.includes("/") ||
      capture.output.includes("..") ||
      !capture.output.endsWith(".png")
    ) {
      throw new Error(`invalid capture output ${capture.output}`);
    }
    if (capture.routeKey !== expectedRouteKey(capture.stage)) {
      throw new Error(`capture ${capture.id} has invalid routeKey`);
    }
  }

  for (const slug of COMMERCIAL_STUDY_SLUGS) {
    const brandCaptures = parsed.captures.filter((capture) => capture.brand === slug);
    const desktop = brandCaptures.filter(
      (capture) => capture.viewport.width === 1440 && capture.viewport.height === 1000,
    );
    const mobile = brandCaptures.filter(
      (capture) => capture.viewport.width === 390 && capture.viewport.height === 844,
    );
    if (desktop.length !== 5) {
      throw new Error(`${slug} must have 5 desktop captures at 1440x1000`);
    }
    if (new Set(desktop.map((capture) => capture.stage)).size !== STAGES.length) {
      throw new Error(`${slug} desktop captures must cover all five stages`);
    }
    if (mobile.length !== MOBILE_STAGES.length) {
      throw new Error(`${slug} must have mobile captures for training, results, and decision`);
    }
    for (const capture of mobile) {
      if (!MOBILE_STAGES.includes(capture.stage as (typeof MOBILE_STAGES)[number])) {
        throw new Error("mobile only for training, results, decision");
      }
    }
    if (brandCaptures.length !== desktop.length + mobile.length) {
      throw new Error(`${slug} captures must be desktop 1440x1000 or mobile 390x844`);
    }
  }
}

export function loadCommercialStudiesManifest(filePath: string): CommercialStudiesManifest {
  const raw: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  const parsed = commercialStudiesManifestSchema.parse(raw);
  validateCommercialStudiesManifest(parsed);
  return parsed;
}

export type ResolvedCapture = {
  id: string;
  brand: CommercialStudySlug;
  stage: "context" | "training" | "direction" | "results" | "decision";
  route: string;
  viewport: { width: number; height: number };
  waitFor: string;
  output: string;
};

const COMMERCIAL_SCREENSHOTS_ROOT = resolve(
  __dirname,
  "../../../docs/commercial-studies/real-brands/screenshots",
);

export function assertCaptureOutputPath(output: string): string {
  const root = resolve(COMMERCIAL_SCREENSHOTS_ROOT);
  const resolved = resolve(root, basename(output));
  const rel = relative(root, resolved);
  if (
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    isAbsolute(output) ||
    basename(output) !== output
  ) {
    throw new Error(`capture output escapes screenshot directory: ${output}`);
  }
  return resolved;
}

function routeForCapture(
  routeKey: "brandTraining" | "creativeWork" | "library",
  study: ResolvedCommercialStudies["studies"][CommercialStudySlug],
): string {
  if (routeKey === "brandTraining") return study.routes.brandTraining;
  if (routeKey === "creativeWork") return study.routes.creativeWork;
  return study.routes.library;
}

export function resolveCommercialCaptures(
  manifest: CommercialStudiesManifest,
  runtime: ResolvedCommercialStudies,
): ResolvedCapture[] {
  return manifest.captures.map((capture) => {
    const study = runtime.studies[capture.brand];
    assertCaptureOutputPath(capture.output);
    return {
      id: capture.id,
      brand: capture.brand,
      stage: capture.stage,
      route: routeForCapture(capture.routeKey, study),
      viewport: capture.viewport,
      waitFor: capture.waitFor,
      output: capture.output,
    };
  });
}

export function assertOriginalFiles(manifest: CommercialStudiesManifest, originalsDir: string): void {
  const originalsRoot = resolve(originalsDir);
  for (const study of manifest.studies) {
    if (!study.originals.some((original) => original.entersTraining)) {
      throw new Error("each study requires at least one original with entersTraining");
    }
    for (const original of study.originals) {
      const filePath = resolveOriginalFile(originalsRoot, original.fileName);
      if (!existsSync(filePath)) {
        throw new Error(`Original file missing: ${original.fileName}`);
      }
      const digest = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      if (digest !== original.sha256) {
        throw new Error(`sha256 mismatch for ${original.fileName}`);
      }
    }
  }
}

export const REAL_RESULTS_PENDING = "real_results_pending";

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

export type CommercialScreenshotIndexRow = {
  id: string;
  brand: string;
  stage: string;
  viewport: { width: number; height: number };
  output: string;
  status: string;
};

export function validateCommercialStudyArtifacts(
  artifacts: CommercialStudyArtifact[],
  options: { requireRealResults: boolean },
): void {
  const isolated = artifacts.filter((artifact) => artifact.kind === "isolated_result");

  for (const artifact of artifacts) {
    if (artifact.kind === "isolated_result" && artifact.provenance !== "real") {
      throw new Error("isolated_result requires real provenance, not controlled");
    }
    if (artifact.provenance === "real" && !artifact.providerEvidencePath) {
      throw new Error("real artifact requires provider evidence");
    }
  }

  if (isolated.length === 0) {
    if (options.requireRealResults) {
      throw new Error("real results required");
    }
    return;
  }

  for (const slug of COMMERCIAL_STUDY_SLUGS) {
    const count = isolated.filter((artifact) => artifact.brand === slug).length;
    if (count !== 2) {
      throw new Error(`${slug} must have exactly two isolated results`);
    }
  }
}

export function validateCommercialScreenshotIndex(rows: CommercialScreenshotIndexRow[]): void {
  if (rows.length !== 24) {
    throw new Error("INDEX.json must have 24 rows");
  }
  const paths = new Set<string>();
  for (const row of rows) {
    if (paths.has(row.output)) {
      throw new Error(`duplicate path ${row.output}`);
    }
    paths.add(row.output);
    const desktop = row.viewport.width === 1440 && row.viewport.height === 1000;
    const mobile = row.viewport.width === 390 && row.viewport.height === 844;
    if (!desktop && !mobile) {
      throw new Error(`invalid dimensions for ${row.id}`);
    }
  }
}

export function assertSelectedRealOutputIds(
  studies: ResolvedCommercialStudies["studies"],
): void {
  for (const slug of COMMERCIAL_STUDY_SLUGS) {
    const ids = studies[slug]?.selectedRealOutputIds ?? [];
    if (ids.length !== 2) {
      throw new Error(
        `package mode requires selectedRealOutputIds length 2 for ${slug}, got ${ids.length}`,
      );
    }
  }
}

export function assertRealProviderEvidence(evidence: unknown): void {
  const text = JSON.stringify(evidence);
  if (text.includes("e2e-controlled-image")) {
    throw new Error("e2e-controlled-image cannot satisfy real provenance");
  }
  if (
    evidence != null
    && typeof evidence === "object"
    && !Array.isArray(evidence)
    && "sourceLabel" in evidence
    && typeof evidence.sourceLabel === "string"
  ) {
    if (!(SOURCE_LABELS as readonly string[]).includes(evidence.sourceLabel)) {
      throw new Error(`sourceLabel must be one of ${SOURCE_LABELS.join(", ")}`);
    }
    if (evidence.sourceLabel === "synthetic_fixture") {
      throw new Error("synthetic_fixture cannot satisfy real provenance");
    }
  }
}
