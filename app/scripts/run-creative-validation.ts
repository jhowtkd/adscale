import "./load-env";

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import OpenAI, { toFile } from "openai";
import sharp from "sharp";

import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { analyzeDerivationCreative } from "@/server/ai/creative-score";
import {
  CANONICAL_CAMPAIGNS,
  type CanonicalCampaignSlug,
} from "@/server/ai/creative-corpus";
import type { CreativeContract } from "@/server/ai/creative-contract";
import {
  computeQualityGateFromAnalysis,
  type CreativeQaChecklistWithStyle,
} from "@/server/ai/creative-quality-gate";
import {
  computeCreativeValidationAggregate,
  capturePassesFactualFidelity,
  FIDELITY_HARD_FAILURE_CODES,
  type CreativeValidationAfterCapture,
} from "@/server/ai/creative-validation-aggregation";
import { shouldAutoRetryDerivation } from "@/server/ai/derivation-auto-retry-policy";
import { buildHardFailureRegenerationSuggestion } from "@/server/ai/creative-score";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";
import {
  artVariationContractFixture,
  derivationConfigFromContract,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "@/server/ai/prompt-builder.test-fixtures";
import { normalizeGeneratedImage } from "@/server/jobs/derivation";
import {
  formatToOpenAIImageSize,
  getTargetDimensions,
  toOpenAISdkImageSize,
} from "@/lib/formats";
import { env } from "@/server/validation/env";

import {
  CREATIVE_VALIDATION_MATRIX,
  CREATIVE_VALIDATION_SEED_SUPPORTED,
  matrixKeys,
  matrixRowByKey,
  type CreativeValidationMatrixRow,
} from "./creative-validation-matrix";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const EXPORTS_DIR = path.join(APP_ROOT, "exports/render-creatives");
const MANIFEST_PATH = path.join(EXPORTS_DIR, "manifest.json");
const BASE_ASSETS_DIR = path.join(APP_ROOT, "tests/fixtures/creative-corpus/base-assets");
const VALIDATION_AFTER_DIR = path.join(EXPORTS_DIR, "validation-after");
const EVIDENCE_PATH = path.join(
  REPO_ROOT,
  ".planning/phases/123-visual-validation-gate/123-EVIDENCE.json"
);

const IMAGE_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const LOCALE = "pt-BR";

// CLI usage:
//   --dry-run              Resolve before captures only (no scoring or evidence write beyond dry-run exit)
//   --from-png <path>      Score a specific validation-after PNG (no OpenAI image call)
//   --matrix-key <key>     Process a single matrix cell (default: full matrix)
//   --keep-if-better       With --merge, keep existing capture when incoming is not better
//   --attempts <n>         Live regen attempts per matrix cell (default 1); each attempt may auto-retry once

interface ManifestEntry {
  fileName: string;
  id: string;
  public_url?: string;
}

interface BeforeCapture {
  key: string;
  source: "corpus";
  corpusRefId: string;
  path?: string;
  sha256: string;
  public_url?: string;
  auditArchetype?: string;
}

interface CliOptions {
  dryRun: boolean;
  skipRegen: boolean;
  merge: boolean;
  keepIfBetter: boolean;
  attempts: number;
  matrixKey?: string;
  fromPng?: string;
}

interface ExistingEvidence {
  seedSupported: boolean;
  pipeline: {
    promptHash: string;
    openaiImageModel: string;
    matrixVersion: number;
  };
  beforeCaptures: BeforeCapture[];
  afterCaptures: CreativeValidationAfterCapture[];
}

function parseArgs(argv: string[]): CliOptions {
  const matrixKeyIndex = argv.indexOf("--matrix-key");
  const fromPngIndex = argv.indexOf("--from-png");
  const attemptsIndex = argv.indexOf("--attempts");
  const attemptsRaw = attemptsIndex >= 0 ? argv[attemptsIndex + 1] : "1";
  const attempts = Math.max(1, Number.parseInt(attemptsRaw, 10) || 1);
  return {
    dryRun: argv.includes("--dry-run"),
    skipRegen: argv.includes("--skip-regen"),
    merge: argv.includes("--merge"),
    keepIfBetter: argv.includes("--keep-if-better"),
    attempts,
    matrixKey: matrixKeyIndex >= 0 ? argv[matrixKeyIndex + 1] : undefined,
    fromPng: fromPngIndex >= 0 ? argv[fromPngIndex + 1] : undefined,
  };
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Buffer(fs.readFileSync(filePath));
}

function repoRelativePath(absolutePath: string): string {
  return path.relative(REPO_ROOT, absolutePath).split(path.sep).join("/");
}

function getPromptProvenanceHash(): string {
  const promptBuilderPath = path.join(APP_ROOT, "src/server/ai/prompt-builder.ts");
  return execFileSync("git", ["hash-object", promptBuilderPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

function loadManifest(): ManifestEntry[] {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ManifestEntry[];
}

function findManifestEntry(corpusRefId: string, manifest: ManifestEntry[]): ManifestEntry | undefined {
  return manifest.find(
    (entry) => entry.id.startsWith(corpusRefId) || entry.fileName.includes(`__${corpusRefId}`)
  );
}

async function fetchPublicUrl(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function resolveBeforeCapture(
  row: CreativeValidationMatrixRow,
  manifest: ManifestEntry[]
): Promise<BeforeCapture> {
  const entry = findManifestEntry(row.beforeCorpusRefId, manifest);
  if (!entry) {
    throw new Error(`No manifest entry for corpusRefId ${row.beforeCorpusRefId} (${row.key})`);
  }

  const localPath = path.join(EXPORTS_DIR, entry.fileName);
  let buffer: Buffer;
  let relativePath: string | undefined;

  if (fs.existsSync(localPath)) {
    buffer = fs.readFileSync(localPath);
    relativePath = repoRelativePath(localPath);
  } else if (entry.public_url) {
    buffer = await fetchPublicUrl(entry.public_url);
  } else {
    throw new Error(`Missing local file and public_url for ${row.key}`);
  }

  const capture: BeforeCapture = {
    key: row.key,
    source: "corpus",
    corpusRefId: row.beforeCorpusRefId,
    sha256: sha256Buffer(buffer),
    public_url: entry.public_url,
  };

  if (relativePath) {
    capture.path = relativePath;
  }
  if (row.auditArchetype) {
    capture.auditArchetype = row.auditArchetype;
  }

  return capture;
}

function buildContractForRow(row: CreativeValidationMatrixRow): CreativeContract {
  const campaign = CANONICAL_CAMPAIGNS[row.canonicalSlug];
  const brand = campaign.allowedEntities.brands[0] ?? null;
  const product = campaign.allowedEntities.products[0] ?? null;
  const offer = campaign.allowedEntities.claims[0] ?? null;
  const constraints =
    row.auditArchetype != null
      ? `Validation matrix cell; preserve canonical ${row.canonicalSlug} facts`
      : `Validation matrix cell for ${row.canonicalSlug}`;

  const shared = { client: brand, product, offer, constraints, targetFormat: row.format };

  switch (row.mode) {
    case "art_variation":
      return artVariationContractFixture({
        ...shared,
        generationMode: "art_variation",
        ctaSemantics: { kind: "explicit", text: "Saiba mais" },
      });
    case "format_adaptation":
      return formatAdaptationCampaignAssetContractFixture({
        ...shared,
        generationMode: "format_adaptation",
        ctaSemantics: { kind: "explicit", text: "Saiba mais" },
      });
    case "restyling":
      return restylingContractFixture({
        ...shared,
        generationMode: "restyling",
        baseAssetId: "validation-base",
        styleAssetId: "validation-style",
        ctaSemantics: { kind: "inherited" },
      });
    default:
      throw new Error(`Unsupported mode for ${row.key}`);
  }
}

function buildCampaignContext(slug: CanonicalCampaignSlug) {
  const campaign = CANONICAL_CAMPAIGNS[slug];
  return {
    name: campaign.displayNames[0] ?? slug,
    client: campaign.allowedEntities.brands[0] ?? "",
    product: campaign.allowedEntities.products[0] ?? "",
    offer: campaign.allowedEntities.claims[0] ?? "",
    objective: campaign.allowedEntities.claims.join("; ") || "Canonical validation objective",
    audience: "Canonical validation audience",
  };
}

function buildDerivationContext(row: CreativeValidationMatrixRow) {
  return {
    ctaText: row.mode === "restyling" ? null : "Saiba mais",
    format: row.format,
    generationMode: row.mode,
    feedback: null as string | null,
    creativeLevel: row.creativeLevel,
    creativeDiagnosis: null,
  };
}

function readBaseAsset(fileName: string): Buffer {
  const assetPath = path.join(BASE_ASSETS_DIR, fileName);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing base asset ${assetPath}`);
  }
  return fs.readFileSync(assetPath);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

async function downloadImageResult(first: OpenAI.Images.Image): Promise<Buffer> {
  if (first.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (first.url) {
    const response = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      throw new Error(`Failed to download generated image: HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("No image data returned from OpenAI");
}

async function regenerateAfter(
  row: CreativeValidationMatrixRow,
  contract: CreativeContract,
  openai: OpenAI,
  feedback?: string | null
): Promise<Buffer> {
  const basePrompt = await buildDerivationPrompt({
    ...derivationConfigFromContract(contract, { creativeLevel: row.creativeLevel }),
    locale: LOCALE,
    feedback: feedback ?? null,
  });
  const prompt =
    feedback && feedback.trim().length > 0
      ? `${basePrompt}\n\nAUTO-RETRY CORRECTION:\nThe previous output failed QA. Fix these issues exactly:\n${feedback}`
      : basePrompt;

  const openaiSize = toOpenAISdkImageSize(
    formatToOpenAIImageSize(row.format, {
      isPreview: false,
      modelName: env.OPENAI_IMAGE_MODEL,
    })
  );

  const baseBuffer = readBaseAsset(row.baseAsset);
  const baseFile = await toFile(baseBuffer, "base-image", { type: "image/png" });

  let editImage: OpenAI.Images.ImageEditParams["image"] = baseFile;
  if (row.mode === "restyling") {
    if (!row.styleAsset) {
      throw new Error(`Restyling row ${row.key} missing styleAsset`);
    }
    const styleBuffer = readBaseAsset(row.styleAsset);
    const styleFile = await toFile(styleBuffer, "style-reference", { type: "image/png" });
    editImage = [baseFile, styleFile];
  }

  const response = await withTimeout(
    openai.images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: editImage,
      prompt,
      n: 1,
      size: openaiSize,
    }),
    IMAGE_GENERATION_TIMEOUT_MS,
    `OpenAI image edit (${row.key})`
  );

  const first = response.data?.[0];
  if (!first) {
    throw new Error(`No image data returned for ${row.key}`);
  }

  let buffer = await downloadImageResult(first);
  const dimensions = getTargetDimensions(row.format, false);
  if (dimensions) {
    buffer = await normalizeGeneratedImage(buffer, dimensions, row.mode);
  }
  return buffer;
}

function findExistingAfterPng(key: string): string | undefined {
  if (!fs.existsSync(VALIDATION_AFTER_DIR)) {
    return undefined;
  }
  const prefix = `${key}__`;
  const match = fs
    .readdirSync(VALIDATION_AFTER_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".png"))
    .sort()
    .at(-1);
  return match ? path.join(VALIDATION_AFTER_DIR, match) : undefined;
}

async function scoreAfterCapture(
  buffer: Buffer,
  row: CreativeValidationMatrixRow,
  contract: CreativeContract
): Promise<CreativeValidationAfterCapture> {
  const campaign = buildCampaignContext(row.canonicalSlug);
  const derivation = buildDerivationContext(row);

  const qa = await analyzeCreativeQa({
    imageBuffer: buffer,
    mimeType: "image/png",
    locale: LOCALE,
    campaign,
    derivation,
    contract,
  });

  const score = await analyzeDerivationCreative({
    imageBuffer: buffer,
    mimeType: "image/png",
    locale: LOCALE,
    campaign,
    derivation,
    contract,
  });

  const gated = computeQualityGateFromAnalysis({
    checklist: qa.checklist as CreativeQaChecklistWithStyle,
    contract,
    scoreIssues: score.scoreIssues,
    qualityScore: score.qualityScore,
    scoreBreakdown: score.scoreBreakdown,
  });

  const sha256 = sha256Buffer(buffer);
  const fileName = `${row.key}__${sha256.slice(0, 8)}.png`;
  const absolutePath = path.join(VALIDATION_AFTER_DIR, fileName);
  fs.mkdirSync(VALIDATION_AFTER_DIR, { recursive: true });
  fs.writeFileSync(absolutePath, buffer);

  const fidelityHits = gated.hardFailures.filter((failure) =>
    FIDELITY_HARD_FAILURE_CODES.has(failure.code)
  );
  if (fidelityHits.length > 0) {
    console.error(
      `FIDELITY FAILURE ${row.key}: ${fidelityHits.map((failure) => failure.code).join(", ")}`
    );
  }

  return {
    key: row.key,
    source: "regenerated",
    path: repoRelativePath(absolutePath),
    sha256,
    qualityScore: gated.qualityScore,
    qualityVerdict: gated.qualityVerdict,
    hardFailures: gated.hardFailures,
    qa: { checklist: qa.checklist },
    score: { scoreBreakdown: score.scoreBreakdown },
  };
}

async function captureLiveWithAutoRetry(
  row: CreativeValidationMatrixRow,
  contract: CreativeContract,
  openai: OpenAI
): Promise<CreativeValidationAfterCapture> {
  let buffer = await regenerateAfter(row, contract, openai);
  let capture = await scoreAfterCapture(buffer, row, contract);

  const shouldRetry =
    capture.hardFailures.length > 0 &&
    (shouldAutoRetryDerivation(row.mode, capture.hardFailures, false) ||
      capture.qualityScore < 75);

  if (shouldRetry) {
    const correctionFeedback = buildHardFailureRegenerationSuggestion({
      hardFailures: capture.hardFailures,
      contract,
      qaChecklist: capture.qa.checklist,
    });
    console.log(
      `auto-retry ${row.key} failures=${capture.hardFailures.map((failure) => failure.code).join(",")}`
    );
    buffer = await regenerateAfter(row, contract, openai, correctionFeedback);
    const retryCapture = await scoreAfterCapture(buffer, row, contract);
    if (isCaptureBetter(retryCapture, capture)) {
      console.log(
        `auto-retry ${row.key} improved score ${capture.qualityScore} -> ${retryCapture.qualityScore}`
      );
      capture = retryCapture;
    } else {
      console.log(
        `auto-retry ${row.key} kept score=${capture.qualityScore} over ${retryCapture.qualityScore}`
      );
    }
  }

  return capture;
}

function assertOpenAiKey(options: CliOptions): void {
  if (options.dryRun || options.skipRegen || options.fromPng) {
    return;
  }
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      "OPENAI_API_KEY is required for live capture. Set it in app/.env.local and re-run without --dry-run."
    );
  }
}

function selectRows(matrixKey?: string): CreativeValidationMatrixRow[] {
  if (!matrixKey) {
    return [...CREATIVE_VALIDATION_MATRIX];
  }
  const row = matrixRowByKey(matrixKey);
  if (!row) {
    throw new Error(`Unknown matrix key: ${matrixKey}`);
  }
  return [row];
}

function loadExistingEvidence(): ExistingEvidence {
  if (!fs.existsSync(EVIDENCE_PATH)) {
    throw new Error(
      `--merge requires existing evidence at ${repoRelativePath(EVIDENCE_PATH)}. Run a full matrix capture first.`
    );
  }
  return JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8")) as ExistingEvidence;
}

function isCaptureBetter(
  incoming: CreativeValidationAfterCapture,
  existing: CreativeValidationAfterCapture | undefined
): boolean {
  if (!existing) return true;
  const incomingFidelity = capturePassesFactualFidelity(incoming);
  const existingFidelity = capturePassesFactualFidelity(existing);
  if (incomingFidelity && !existingFidelity) return true;
  if (!incomingFidelity && existingFidelity) return false;
  if (incoming.qualityScore !== existing.qualityScore) {
    return incoming.qualityScore > existing.qualityScore;
  }
  return incoming.hardFailures.length < existing.hardFailures.length;
}

function mergeCapturesByKey<T extends { key: string }>(
  existing: T[],
  incoming: T[],
  processedKeys: Set<string>
): T[] {
  const merged = existing.filter((capture) => !processedKeys.has(capture.key));
  merged.push(...incoming);
  return merged;
}

function assertFullMatrixCoverage(
  beforeCaptures: BeforeCapture[],
  afterCaptures: CreativeValidationAfterCapture[]
): void {
  const expectedKeys = matrixKeys();
  const beforeKeys = new Set(beforeCaptures.map((capture) => capture.key));
  const afterKeys = new Set(afterCaptures.map((capture) => capture.key));

  if (beforeCaptures.length !== expectedKeys.length || beforeKeys.size !== expectedKeys.length) {
    throw new Error(
      `Merge invariant failed: beforeCaptures has ${beforeCaptures.length} entries (expected ${expectedKeys.length})`
    );
  }
  if (afterCaptures.length !== expectedKeys.length || afterKeys.size !== expectedKeys.length) {
    throw new Error(
      `Merge invariant failed: afterCaptures has ${afterCaptures.length} entries (expected ${expectedKeys.length})`
    );
  }

  for (const key of expectedKeys) {
    if (!beforeKeys.has(key)) {
      throw new Error(`Merge invariant failed: missing before capture for ${key}`);
    }
    if (!afterKeys.has(key)) {
      throw new Error(`Merge invariant failed: missing after capture for ${key}`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertOpenAiKey(options);

  const rows = selectRows(options.matrixKey);
  const manifest = loadManifest();
  const beforeCaptures: BeforeCapture[] = [];

  console.log(`Creative validation: ${rows.length} matrix cell(s)`);
  if (options.dryRun) {
    console.log("Mode: dry-run (before captures only)");
  } else if (options.skipRegen) {
    console.log("Mode: skip-regen (score existing validation-after PNGs)");
  } else if (options.fromPng) {
    console.log(`Mode: from-png (${options.fromPng})`);
  } else {
    console.log("Mode: live regeneration + scoring");
  }

  for (const row of rows) {
    const before = await resolveBeforeCapture(row, manifest);
    beforeCaptures.push(before);
    console.log(`before ${row.key} sha256=${before.sha256.slice(0, 8)}…`);
  }

  if (options.dryRun) {
    console.log(`Dry-run complete: ${beforeCaptures.length} before capture(s) resolved.`);
    return;
  }

  const openai =
    options.skipRegen || options.fromPng
      ? null
      : new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
  const afterCaptures: CreativeValidationAfterCapture[] = [];

  for (const row of rows) {
    const contract = buildContractForRow(row);
    let buffer: Buffer;

    if (options.fromPng) {
      const fromPath = path.isAbsolute(options.fromPng)
        ? options.fromPng
        : path.join(APP_ROOT, options.fromPng);
      if (!fs.existsSync(fromPath)) {
        throw new Error(`--from-png file not found: ${fromPath}`);
      }
      buffer = fs.readFileSync(fromPath);
      console.log(`from-png ${row.key} ${path.basename(fromPath)}`);
    } else if (options.skipRegen) {
      const existing = findExistingAfterPng(row.key);
      if (!existing) {
        throw new Error(`--skip-regen: no validation-after PNG for ${row.key}`);
      }
      buffer = fs.readFileSync(existing);
      console.log(`skip-regen ${row.key} from ${path.basename(existing)}`);
    } else {
      let bestCapture: CreativeValidationAfterCapture | undefined;
      for (let attempt = 1; attempt <= options.attempts; attempt++) {
        console.log(`regenerating ${row.key} (attempt ${attempt}/${options.attempts})…`);
        const capture = await captureLiveWithAutoRetry(row, contract, openai!);
        if (!bestCapture || isCaptureBetter(capture, bestCapture)) {
          bestCapture = capture;
        }
        if (
          bestCapture.qualityScore >= 75 &&
          bestCapture.hardFailures.length === 0 &&
          capturePassesFactualFidelity(bestCapture)
        ) {
          console.log(`target met ${row.key} score=${bestCapture.qualityScore}`);
          break;
        }
      }
      if (!bestCapture) {
        throw new Error(`No capture produced for ${row.key}`);
      }
      afterCaptures.push(bestCapture);
      console.log(
        `after ${row.key} score=${bestCapture.qualityScore} verdict=${bestCapture.qualityVerdict} failures=${bestCapture.hardFailures.length}`
      );
      continue;
    }

    const capture = await scoreAfterCapture(buffer, row, contract);
    afterCaptures.push(capture);
    console.log(
      `after ${row.key} score=${capture.qualityScore} verdict=${capture.qualityVerdict} failures=${capture.hardFailures.length}`
    );
  }

  const processedKeys = new Set(rows.map((row) => row.key));
  let finalBeforeCaptures = beforeCaptures;
  let finalAfterCaptures = afterCaptures;
  let seedSupported = CREATIVE_VALIDATION_SEED_SUPPORTED;
  let matrixVersion = 1;

  if (options.merge) {
    const existing = loadExistingEvidence();
    const existingAfterByKey = new Map(
      existing.afterCaptures.map((capture) => [capture.key, capture])
    );
    const mergedIncoming = afterCaptures.map((capture) => {
      if (!options.keepIfBetter) return capture;
      const prior = existingAfterByKey.get(capture.key);
      if (isCaptureBetter(capture, prior)) {
        return capture;
      }
      console.log(
        `keep-if-better ${capture.key}: retained score=${prior!.qualityScore} over ${capture.qualityScore}`
      );
      return prior!;
    });
    finalBeforeCaptures = mergeCapturesByKey(existing.beforeCaptures, beforeCaptures, processedKeys);
    finalAfterCaptures = mergeCapturesByKey(existing.afterCaptures, mergedIncoming, processedKeys);
    assertFullMatrixCoverage(finalBeforeCaptures, finalAfterCaptures);
    seedSupported = existing.seedSupported;
    matrixVersion = existing.pipeline.matrixVersion;
    console.log(
      `merged ${processedKeys.size} key(s), total after captures=${finalAfterCaptures.length}`
    );
  }

  const aggregate = computeCreativeValidationAggregate(finalAfterCaptures);
  const evidence = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    seedSupported,
    pipeline: {
      promptHash: getPromptProvenanceHash(),
      openaiImageModel: env.OPENAI_IMAGE_MODEL,
      matrixVersion,
    },
    beforeCaptures: finalBeforeCaptures,
    afterCaptures: finalAfterCaptures,
    aggregate,
    requirements: [
      { id: "QA-18", result: "captured" },
      { id: "QA-19", result: "pending-final-gate" },
      { id: "QA-20", result: "pending-final-gate" },
      { id: "QA-21", result: "pending-final-gate" },
    ],
  };

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Wrote evidence: ${repoRelativePath(EVIDENCE_PATH)}`);
  console.log(
    `Aggregate: meanQualityScore=${aggregate.meanQualityScore.toFixed(2)} factualFidelityRate=${aggregate.factualFidelityRate.toFixed(3)}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
