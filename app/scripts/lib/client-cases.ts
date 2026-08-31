import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

export const CLIENT_CASE_SLUGS = ["nike", "amazon", "burger-king"] as const;
export type ClientCaseSlug = (typeof CLIENT_CASE_SLUGS)[number];

export const CLIENT_CASES_EMAIL = "estudos@example.test";
export const CLIENT_CASES_WORKSPACE = "ADScale";

export type ClientCaseAuthorization = {
  authorizedBy: "cliente";
  commercialUse: true;
  scope: string;
  documentRef: string | null;
};

const authorizationSchema = z.object({
  authorizedBy: z.literal("cliente"),
  commercialUse: z.literal(true),
  scope: z.string().trim().min(1),
  documentRef: z.string().nullable(),
});

export type ResolvedClientCases = {
  sourceManifest: string;
  generatedAt: string;
  account: { email: string; userId: string; workspaceId: string };
  studies: Record<
    ClientCaseSlug,
    {
      clientProfileId: string;
      creativeWorkId: string;
      freshWorkId?: string;
      trainingReferenceIds: string[];
      assetKeys: string[];
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

const assetSchema = z.object({
  id: z.string().min(1),
  fileName: z
    .string()
    .min(1)
    .refine((value) => basename(value) === value && !value.includes("..") && !isAbsolute(value), {
      message: "fileName must be a basename",
    }),
  sha256: z.string().length(64),
  role: z.enum(["brand_asset", "campaign_reference", "product_reference"]),
  usageMode: z.enum(["reference", "exact"]),
});

const briefSchema = z.object({
  theme: z.string().trim().min(1).max(240),
  objective: z.string().trim().min(1).max(240),
  audience: z.string().trim().max(240),
  offer: z.string().trim().min(1).max(240).nullable(),
});

const captureSchema = z.object({
  id: z.string().min(1),
  brand: z.enum(CLIENT_CASE_SLUGS),
  stage: z.enum(["context", "training", "direction", "results", "decision"]),
  routeKey: z.enum(["brandTraining", "creativeWork", "library"]),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  waitFor: z.string().min(1),
  output: z
    .string()
    .endsWith(".png")
    .refine((value) => basename(value) === value && !value.includes("..") && !isAbsolute(value), {
      message: "output must be a basename",
    }),
});

export const clientCasesManifestSchema = z.object({
  version: z.literal(1),
  environment: z.literal("development"),
  studies: z
    .array(
      z.object({
        slug: z.enum(CLIENT_CASE_SLUGS),
        brand: z.string().min(1),
        focus: z.string().min(1),
        profileName: z.string().min(1),
        authorization: authorizationSchema,
        assets: z.array(assetSchema),
        briefs: z.object({
          primary: briefSchema,
          fresh: briefSchema,
        }),
      }),
    )
    .length(3),
  captures: z.array(captureSchema).length(24),
});

export type ClientCasesManifest = z.infer<typeof clientCasesManifestSchema>;

export function clientCaseProfileName(slug: ClientCaseSlug): string {
  const names: Record<ClientCaseSlug, string> = {
    nike: "Nike — Pegasus 41",
    amazon: "Amazon",
    "burger-king": "Burger King",
  };
  return names[slug];
}

export function validateClientCasesManifest(manifest: ClientCasesManifest): void {
  const seen = new Set<string>();
  for (const study of manifest.studies) {
    if (seen.has(study.slug)) throw new Error(`duplicate study slug ${study.slug}`);
    seen.add(study.slug);
    if (study.profileName !== clientCaseProfileName(study.slug)) {
      throw new Error(`profileName mismatch for ${study.slug}`);
    }
    if (study.assets.length === 0) {
      throw new Error(`study ${study.slug} has no client assets`);
    }
    for (const asset of study.assets) {
      if (asset.usageMode === "exact" && asset.role !== "brand_asset") {
        throw new Error(`${asset.id}: exact usage requires brand_asset role`);
      }
    }
  }
  if (seen.size !== 3) throw new Error("manifest must cover all three client cases");

  const captureIds = new Set<string>();
  const outputs = new Set<string>();
  const byBrand = new Map<ClientCaseSlug, ClientCasesManifest["captures"]>();
  for (const capture of manifest.captures) {
    if (captureIds.has(capture.id)) throw new Error(`duplicate capture id ${capture.id}`);
    captureIds.add(capture.id);
    if (outputs.has(capture.output)) throw new Error(`duplicate capture output ${capture.output}`);
    outputs.add(capture.output);
    const list = byBrand.get(capture.brand) ?? [];
    list.push(capture);
    byBrand.set(capture.brand, list);
  }
  for (const slug of CLIENT_CASE_SLUGS) {
    const list = byBrand.get(slug) ?? [];
    const desktop = list.filter((c) => c.viewport.width === 1440);
    const mobile = list.filter((c) => c.viewport.width === 390);
    if (desktop.length !== 5) throw new Error(`${slug}: expected 5 desktop captures`);
    if (mobile.length !== 3) throw new Error(`${slug}: expected 3 mobile captures`);
    for (const stage of ["context", "training", "direction", "results", "decision"] as const) {
      if (!desktop.some((c) => c.stage === stage)) throw new Error(`${slug}: missing desktop ${stage}`);
    }
    for (const stage of ["training", "results", "decision"] as const) {
      if (!mobile.some((c) => c.stage === stage)) throw new Error(`${slug}: missing mobile ${stage}`);
    }
  }
}

export function loadClientCasesManifest(filePath: string): ClientCasesManifest {
  const parsed = clientCasesManifestSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  validateClientCasesManifest(parsed);
  return parsed;
}

export function assertClientAssetFiles(manifest: ClientCasesManifest, assetsDir: string): void {
  for (const study of manifest.studies) {
    let hasReference = false;
    for (const asset of study.assets) {
      const filePath = resolve(assetsDir, study.slug, asset.fileName);
      const relativePath = relative(assetsDir, filePath);
      if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error(`${asset.id}: fileName escapes assets dir`);
      }
      if (!existsSync(filePath)) {
        throw new Error(`client asset missing: ${study.slug}/${asset.fileName}`);
      }
      const sha = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      if (sha !== asset.sha256) {
        throw new Error(`client asset hash mismatch: ${study.slug}/${asset.fileName}`);
      }
      hasReference = true;
    }
    if (!hasReference) throw new Error(`study ${study.slug} has no reference assets`);
  }
}

export type ClientResolvedCapture = {
  id: string;
  brand: ClientCaseSlug;
  stage: "context" | "training" | "direction" | "results" | "decision";
  route: string;
  viewport: { width: number; height: number };
  waitFor: string;
  output: string;
};

const CLIENT_ROUTE_BY_KEY: Record<string, (study: ResolvedClientCases["studies"][ClientCaseSlug]) => string> = {
  brandTraining: () => "/brand-kit",
  creativeWork: (study) => study.routes.creativeWork,
  library: () => "/library",
};

export function resolveClientCaptures(
  manifest: ClientCasesManifest,
  runtime: ResolvedClientCases,
): ClientResolvedCapture[] {
  return manifest.captures.map((capture) => {
    const study = runtime.studies[capture.brand];
    const buildRoute = CLIENT_ROUTE_BY_KEY[capture.routeKey];
    if (!buildRoute) throw new Error(`unknown routeKey ${capture.routeKey}`);
    return {
      id: capture.id,
      brand: capture.brand,
      stage: capture.stage,
      route: buildRoute(study),
      viewport: capture.viewport,
      waitFor: capture.waitFor,
      output: capture.output,
    };
  });
}

export function assertClientCaptureOutputPath(output: string, root: string): string {
  if (output.includes("/") || output.includes("\\") || output.includes("..")) {
    throw new Error(`capture output must be a plain basename: ${output}`);
  }
  const resolved = resolve(root, output);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || rel === ".." || isAbsolute(rel)) {
    throw new Error(`capture output escapes directory: ${output}`);
  }
  return resolved;
}
