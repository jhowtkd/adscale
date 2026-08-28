import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import {
  assertRealProviderEvidence,
  assertSelectedRealOutputIds,
  COMMERCIAL_STUDY_SLUGS,
  REAL_RESULTS_PENDING,
  validateCommercialScreenshotIndex,
  validateCommercialStudyArtifacts,
  type CommercialStudyArtifact,
  type ResolvedCommercialStudies,
} from "./lib/commercial-studies";

const { SOURCE_LABELS, validateSourceComposition } = createRequire(__filename)(
  "./lib/evidence-honesty.mjs",
) as {
  SOURCE_LABELS: readonly string[];
  validateSourceComposition: (composition: unknown, prefix: string, errors: string[]) => void;
};

const REPO_ROOT = path.resolve(__dirname, "../..");
const STUDIES_ROOT = path.join(REPO_ROOT, "docs/commercial-studies/real-brands");
const INDEX_PATH = path.join(STUDIES_ROOT, "screenshots/INDEX.json");
const ARTIFACTS_PATH = path.join(STUDIES_ROOT, "evidence/ARTIFACTS.json");
const RESULTS_DIR = path.join(STUDIES_ROOT, "results");
const RESOLVED_PATH = path.join(STUDIES_ROOT, "evidence/resolved-manifest.json");

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function resolveUnder(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path escapes ${root}: ${relativePath}`);
  }
  return resolved;
}

function loadArtifacts(): CommercialStudyArtifact[] {
  if (!existsSync(ARTIFACTS_PATH)) return [];
  const raw: unknown = JSON.parse(readFileSync(ARTIFACTS_PATH, "utf8"));
  if (Array.isArray(raw)) return raw as CommercialStudyArtifact[];
  if (
    raw != null
    && typeof raw === "object"
    && "artifacts" in raw
    && Array.isArray(raw.artifacts)
  ) {
    return raw.artifacts as CommercialStudyArtifact[];
  }
  throw new Error("ARTIFACTS.json is invalid");
}

function isolatedResultFiles(): string[] {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
}

function loadIndexRows(): ReturnType<typeof JSON.parse> | null {
  if (!existsSync(INDEX_PATH)) return null;
  const raw: unknown = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  if (raw == null || typeof raw !== "object" || !("results" in raw) || !Array.isArray(raw.results)) {
    throw new Error("INDEX.json is invalid");
  }
  return raw.results;
}

function assertEvidenceFile(artifact: CommercialStudyArtifact): void {
  if (!artifact.providerEvidencePath) {
    throw new Error(`real artifact requires provider evidence: ${artifact.id}`);
  }
  const evidencePath = resolveUnder(STUDIES_ROOT, artifact.providerEvidencePath);
  if (!existsSync(evidencePath)) {
    throw new Error(`provider evidence missing: ${artifact.providerEvidencePath}`);
  }
  const evidence: unknown = JSON.parse(readFileSync(evidencePath, "utf8"));
  assertHonesty(evidence);
}

function assertHonesty(evidence: unknown): void {
  assertRealProviderEvidence(evidence);
  if (evidence != null && typeof evidence === "object" && "sourceComposition" in evidence) {
    const errors: string[] = [];
    validateSourceComposition(
      (evidence as { sourceComposition: unknown }).sourceComposition,
      "providerEvidence",
      errors,
    );
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }
  if (
    evidence != null
    && typeof evidence === "object"
    && "sourceLabel" in evidence
    && typeof (evidence as { sourceLabel: unknown }).sourceLabel === "string"
    && !(SOURCE_LABELS as readonly string[]).includes((evidence as { sourceLabel: string }).sourceLabel)
  ) {
    throw new Error(`sourceLabel must be one of ${SOURCE_LABELS.join(", ")}`);
  }
}

function pendingRealResults(): never {
  console.log(REAL_RESULTS_PENDING);
  process.exit(0);
}

function validateOnly(): void {
  const rows = loadIndexRows();
  if (rows == null) {
    pendingRealResults();
  }
  validateCommercialScreenshotIndex(rows);

  const artifacts = loadArtifacts();
  const isolated = artifacts.filter((artifact) => artifact.kind === "isolated_result");
  const resultFiles = isolatedResultFiles();

  if (isolated.length === 0 && resultFiles.length === 0) {
    validateCommercialStudyArtifacts(artifacts, { requireRealResults: false });
    pendingRealResults();
  }

  if (isolated.length === 0 && resultFiles.length > 0) {
    throw new Error("isolated results exist without provider evidence");
  }

  validateCommercialStudyArtifacts(artifacts, { requireRealResults: true });
  for (const artifact of isolated) {
    assertEvidenceFile(artifact);
  }
}

async function packageResults(): Promise<void> {
  if (!existsSync(RESOLVED_PATH)) {
    throw new Error("resolved-manifest.json is required for package mode");
  }
  const runtime = JSON.parse(readFileSync(RESOLVED_PATH, "utf8")) as ResolvedCommercialStudies;
  assertSelectedRealOutputIds(runtime.studies);

  await import("./load-env");
  const { objectStorage } = await import("../src/server/storage");
  const { getCreativeWork } = await import("../src/server/repositories/creative-work");

  mkdirSync(RESULTS_DIR, { recursive: true });
  mkdirSync(path.dirname(ARTIFACTS_PATH), { recursive: true });

  const artifacts: CommercialStudyArtifact[] = [];
  for (const slug of COMMERCIAL_STUDY_SLUGS) {
    const study = runtime.studies[slug];
    const aggregate = await getCreativeWork(runtime.account.workspaceId, study.creativeWorkId);
    if (!aggregate) {
      throw new Error(`Creative Work not found: ${study.creativeWorkId}`);
    }
    for (const outputId of study.selectedRealOutputIds) {
      const output = aggregate.outputs.find((item) => item.id === outputId);
      if (!output || output.status !== "completed" || !output.outputKey) {
        throw new Error(`Completed output not found: ${outputId}`);
      }
      const bytes = await objectStorage.get(output.outputKey);
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error(`${outputId}: Sharp metadata missing dimensions`);
      }
      const evidenceRelative = `evidence/${slug}/${outputId}.json`;
      const evidencePath = resolveUnder(STUDIES_ROOT, evidenceRelative);
      if (!existsSync(evidencePath)) {
        throw new Error(`provider evidence missing: ${evidenceRelative}`);
      }
      const evidence: unknown = JSON.parse(readFileSync(evidencePath, "utf8"));
      assertHonesty(evidence);
      assertHonesty(output.quality ?? {});

      const fileName = `${slug}-${outputId}.png`;
      const dest = path.join(RESULTS_DIR, fileName);
      writeFileSync(dest, bytes);
      artifacts.push({
        id: outputId,
        brand: slug,
        kind: "isolated_result",
        path: `results/${fileName}`,
        sha256: hashBuffer(bytes),
        width: metadata.width,
        height: metadata.height,
        provenance: "real",
        providerEvidencePath: evidenceRelative,
        visualReview: "pending",
        editorialReview: "pending",
      });
    }
  }

  validateCommercialStudyArtifacts(artifacts, { requireRealResults: true });
  writeFileSync(ARTIFACTS_PATH, `${JSON.stringify({ artifacts }, null, 2)}\n`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--validate-only")) {
    validateOnly();
    return;
  }
  await packageResults();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
