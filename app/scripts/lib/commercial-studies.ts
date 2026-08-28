import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const COMMERCIAL_STUDY_SLUGS = ["nike", "mtv", "absolut"] as const;
export type CommercialStudySlug = (typeof COMMERCIAL_STUDY_SLUGS)[number];

export const COMMERCIAL_STUDY_DISCLAIMER =
  "Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.";
export const COMMERCIAL_STUDY_EMAIL = "estudos@example.test";
export const COMMERCIAL_STUDY_WORKSPACE = "ADScale — Estudos Editoriais";

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
      if (original.entersTraining && original.usageStatus !== "approved") {
        throw new Error("entersTraining requires usageStatus approved");
      }
    }
    if (!study.originals.some((original) => original.entersTraining)) {
      throw new Error("each study requires at least one original with entersTraining");
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

export function assertOriginalFiles(manifest: CommercialStudiesManifest, originalsDir: string): void {
  for (const study of manifest.studies) {
    for (const original of study.originals) {
      const filePath = join(originalsDir, original.fileName);
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
