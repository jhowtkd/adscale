import "./register-server-stub";
import "./load-env";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import OpenAI, { toFile } from "openai";

import { CANONICAL_CAMPAIGNS, type CanonicalCampaignSlug } from "@/server/ai/creative-corpus";
import type { CreativeContract, CreativeFidelityLevel } from "@/server/ai/creative-contract";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";
import {
  artVariationContractFixture,
  derivationConfigFromContract,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "@/server/ai/prompt-builder.test-fixtures";
import { normalizeGeneratedImage } from "@/server/jobs/derivation";
import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { computeQualityGateFromAnalysis } from "@/server/ai/creative-quality-gate";
import {
  formatToOpenAIImageSize,
  getTargetDimensions,
  toOpenAISdkImageSize,
} from "@/lib/formats";
import { env } from "@/server/validation/env";

import {
  BLIND_GATE_PAIR_SPECS,
  matrixKeyForSpec,
  type BlindGatePairSpec,
} from "./blind-gate-pair-specs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const EXPORTS_DIR = path.join(APP_ROOT, "exports/render-creatives");
const MANIFEST_PATH = path.join(EXPORTS_DIR, "manifest.json");
const BASE_ASSETS_DIR = path.join(APP_ROOT, "tests/fixtures/creative-corpus/base-assets");
const VALIDATION_AFTER_DIR = path.join(EXPORTS_DIR, "validation-after");
const BLIND_IMAGES_DIR = path.join(REPO_ROOT, ".planning/validation/blind-gate-images");
const EVIDENCE_PATH = path.join(REPO_ROOT, ".planning/validation/image-harness-blind-gate.json");
const REVIEW_HTML_PATH = path.join(REPO_ROOT, ".planning/validation/blind-gate-review.html");
const FIDELITY_IMAGES_DIR = path.join(REPO_ROOT, ".planning/validation/fidelity-matrix-images");
const FIDELITY_EVIDENCE_PATH = path.join(REPO_ROOT, ".planning/validation/image-harness-fidelity-matrix.json");
const FIDELITY_REVIEW_HTML_PATH = path.join(REPO_ROOT, ".planning/validation/fidelity-matrix-review.html");

const LOCALE = "pt-BR";
const IMAGE_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

interface ManifestEntry {
  fileName: string;
  id: string;
  generation_mode?: string;
  format?: string;
  campaign?: string;
  public_url?: string;
}

interface CliOptions {
  dryRun: boolean;
  skipRegen: boolean;
  roundB: boolean;
  qaKnownRegressions: boolean;
  regenerateKnownRegressions: boolean;
  pairId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const pairIndex = argv.indexOf("--pair");
  return {
    dryRun: argv.includes("--dry-run"),
    skipRegen: argv.includes("--skip-regen"),
    roundB: argv.includes("--round-b"),
    qaKnownRegressions: argv.includes("--qa-known-regressions"),
    regenerateKnownRegressions: argv.includes("--regenerate-known-regressions"),
    pairId: pairIndex >= 0 ? argv[pairIndex + 1] : undefined,
  };
}

async function validateKnownRestylingRegressions(
  pairId?: string,
  imageSuffix = "recalibrated"
): Promise<void> {
  const specs = BLIND_GATE_PAIR_SPECS.filter(
    (spec) => (spec.id === "pair-09" || spec.id === "pair-10") && (!pairId || spec.id === pairId)
  );
  if (specs.length === 0) throw new Error(`Unknown known regression ${pairId}`);
  const evidencePath = path.join(
    REPO_ROOT,
    `.planning/validation/restyling-${imageSuffix}-qa.json`
  );
  const priorResults = fs.existsSync(evidencePath)
    ? (JSON.parse(fs.readFileSync(evidencePath, "utf8")) as { results?: Array<Record<string, unknown>> }).results ?? []
    : [];
  const results = [...priorResults];
  for (const spec of specs) {
    const outputPath = path.join(BLIND_IMAGES_DIR, `${spec.id}-${imageSuffix}.png`);
    if (!fs.existsSync(outputPath) || !spec.styleAsset) {
      throw new Error(`Missing known-regression inputs for ${spec.id}`);
    }
    const contract = buildContract(spec);
    const campaign = CANONICAL_CAMPAIGNS[spec.canonicalSlug];
    const qa = await analyzeCreativeQa({
      imageBuffer: fs.readFileSync(outputPath),
      mimeType: "image/png",
      baseImageBuffer: readBaseAsset(spec.baseAsset),
      baseMimeType: "image/png",
      styleImageBuffer: readBaseAsset(spec.styleAsset),
      styleMimeType: "image/png",
      locale: LOCALE,
      campaign: {
        name: campaign.displayNames[0],
        client: campaign.allowedEntities.brands[0] ?? "",
        product: campaign.allowedEntities.products[0] ?? "",
        offer: campaign.allowedEntities.claims[0] ?? "",
        objective: "Blind gate regression validation",
        audience: "Campaign audience",
      },
      derivation: { ctaText: null, format: spec.format, generationMode: spec.mode },
      contract,
    });
    const gate = computeQualityGateFromAnalysis({
      checklist: qa.checklist,
      contract,
      qualityScore: 100,
    });
    const result = { id: spec.id, qa, qualityVerdict: gate.qualityVerdict, hardFailures: gate.hardFailures };
    const existingIndex = results.findIndex((item) => item.id === spec.id);
    if (existingIndex >= 0) results[existingIndex] = result;
    else results.push(result);
    fs.writeFileSync(evidencePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
    console.log(`${spec.id} ${gate.qualityVerdict} ${gate.hardFailures.map((failure) => failure.code).join(",") || "no-hard-failure"}`);
  }
  if (results.some((result) => result.qualityVerdict !== "invalid")) {
    throw new Error("Known restyling regressions were not blocked");
  }
  console.log(`Wrote evidence ${repoRelativePath(evidencePath)}`);
}

async function regenerateKnownRestylingRegressions(pairId?: string): Promise<void> {
  if (!env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY required for live generation");
  const specs = BLIND_GATE_PAIR_SPECS.filter(
    (spec) => (spec.id === "pair-09" || spec.id === "pair-10") && (!pairId || spec.id === pairId)
  );
  if (specs.length === 0) throw new Error(`Unknown known regression ${pairId}`);
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
  for (const spec of specs) {
    const buffer = await generateRecalibrated(spec, buildContract(spec), openai);
    const outputPath = path.join(BLIND_IMAGES_DIR, `${spec.id}-regenerated.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`generated ${spec.id} sha256=${sha256Buffer(buffer).slice(0, 8)}`);
    await validateKnownRestylingRegressions(spec.id, "regenerated");
  }
}

const FIDELITY_LEVELS: CreativeFidelityLevel[] = [
  "conservative",
  "balanced",
  "bold",
  "extreme",
];

function fidelityMatrixSpecs(): BlindGatePairSpec[] {
  const modes: Array<Omit<BlindGatePairSpec, "id" | "creativeLevel">> = [
    {
      mode: "art_variation",
      format: "1:1",
      canonicalSlug: "teste-3-nr1",
      baseAsset: "nr1-1x1-base.png",
    },
    {
      mode: "format_adaptation",
      format: "9:16",
      canonicalSlug: "teste-3-nr1",
      baseAsset: "nr1-1x1-base.png",
    },
    {
      mode: "restyling",
      format: "1:1",
      canonicalSlug: "nova-campanha",
      baseAsset: "educacao-base.png",
      styleAsset: "educacao-style-ref.png",
    },
  ];

  return modes.flatMap((spec) =>
    FIDELITY_LEVELS.map((creativeLevel) => ({
      ...spec,
      creativeLevel,
      id: `round-b-${spec.mode}-${creativeLevel}`,
    }))
  );
}

function repoRelativePath(absolutePath: string): string {
  return path.relative(REPO_ROOT, absolutePath).split(path.sep).join("/");
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
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

function buildContract(spec: BlindGatePairSpec): CreativeContract {
  const campaign = CANONICAL_CAMPAIGNS[spec.canonicalSlug];
  const brand = campaign.allowedEntities.brands[0] ?? null;
  const product = campaign.allowedEntities.products[0] ?? null;
  const offer = campaign.allowedEntities.claims[0] ?? null;
  const constraints = `Blind gate pair ${spec.id}; preserve canonical ${spec.canonicalSlug} facts`;
  const shared = {
    client: brand,
    product,
    offer,
    constraints,
    targetFormat: spec.format,
    creativeLevel: spec.creativeLevel,
  };

  switch (spec.mode) {
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
        baseAssetId: "blind-base",
        styleAssetId: "blind-style",
        ctaSemantics: { kind: "inherited" },
      });
    default:
      throw new Error(`Unsupported mode ${spec.mode}`);
  }
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

async function generateRecalibrated(
  spec: BlindGatePairSpec,
  contract: CreativeContract,
  openai: OpenAI
): Promise<Buffer> {
  const prompt = await buildDerivationPrompt({
    ...derivationConfigFromContract(contract, { creativeLevel: spec.creativeLevel }),
    locale: LOCALE,
    feedback: null,
  });

  const openaiSize = toOpenAISdkImageSize(
    formatToOpenAIImageSize(spec.format, {
      isPreview: false,
      modelName: env.OPENAI_IMAGE_MODEL,
    })
  );

  const baseFile = await toFile(readBaseAsset(spec.baseAsset), "base-image", { type: "image/png" });
  let editImage: OpenAI.Images.ImageEditParams["image"] = baseFile;
  if (spec.mode === "restyling") {
    if (!spec.styleAsset) {
      throw new Error(`Restyling pair ${spec.id} missing styleAsset`);
    }
    const styleFile = await toFile(readBaseAsset(spec.styleAsset), "style-reference", {
      type: "image/png",
    });
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
    `OpenAI image edit (${spec.id})`
  );

  const first = response.data?.[0];
  if (!first) {
    throw new Error(`No image data returned for ${spec.id}`);
  }

  let buffer = await downloadImageResult(first);
  const dimensions = getTargetDimensions(spec.format, false);
  if (dimensions) {
    buffer = await normalizeGeneratedImage(buffer, dimensions, spec.mode);
  }
  return buffer;
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

async function resolveBaselineBuffer(
  spec: BlindGatePairSpec,
  manifest: ManifestEntry[]
): Promise<{ buffer: Buffer; source: string }> {
  const matrixKey = matrixKeyForSpec(spec);
  if (fs.existsSync(VALIDATION_AFTER_DIR)) {
    const prefix = `${matrixKey}__`;
    const match = fs
      .readdirSync(VALIDATION_AFTER_DIR)
      .filter((file) => file.startsWith(prefix) && file.endsWith(".png"))
      .sort()[0];
    if (match) {
      const filePath = path.join(VALIDATION_AFTER_DIR, match);
      return { buffer: fs.readFileSync(filePath), source: `validation-after:${match}` };
    }
  }

  if (spec.baselineCorpusRefId) {
    const entry = findManifestEntry(spec.baselineCorpusRefId, manifest);
    if (entry) {
      const campaign = CANONICAL_CAMPAIGNS[spec.canonicalSlug];
      const normalizedCampaign = entry.campaign?.trim().toLocaleLowerCase(LOCALE);
      const campaignMatches = campaign.displayNames.some(
        (name) => name.toLocaleLowerCase(LOCALE) === normalizedCampaign
      );
      if (
        entry.generation_mode !== spec.mode ||
        entry.format !== spec.format ||
        !campaignMatches
      ) {
        throw new Error(
          `Incompatible baseline ${spec.baselineCorpusRefId} for ${spec.id}: ` +
            `expected ${campaign.displayNames[0]}/${spec.mode}/${spec.format}, got ` +
            `${entry.campaign ?? "unknown"}/${entry.generation_mode ?? "unknown"}/${entry.format ?? "unknown"}`
        );
      }
      const localPath = path.join(EXPORTS_DIR, entry.fileName);
      if (fs.existsSync(localPath)) {
        return { buffer: fs.readFileSync(localPath), source: `corpus:${entry.fileName}` };
      }
      if (entry.public_url) {
        return { buffer: await fetchPublicUrl(entry.public_url), source: `corpus-url:${entry.id}` };
      }
    }
  }

  throw new Error(`No baseline image resolved for ${spec.id} (${matrixKey})`);
}

function presentationForPair(pairId: string): { optionA: "baseline" | "recalibrated"; optionB: "baseline" | "recalibrated" } {
  const swap = createHash("sha256").update(`blind-gate:${pairId}`).digest()[0] % 2 === 1;
  return swap
    ? { optionA: "recalibrated", optionB: "baseline" }
    : { optionA: "baseline", optionB: "recalibrated" };
}

function reviewHtmlImagePath(imageRepoPath: string): string {
  const fileName = path.basename(imageRepoPath);
  return `blind-gate-images/${fileName}`;
}

function writeReviewHtml(
  pairs: Array<{
    id: string;
    mode: string;
    format: string;
    creativeLevel: CreativeFidelityLevel;
    presentation: ReturnType<typeof presentationForPair>;
    images: Record<"baseline" | "recalibrated", string>;
  }>
): void {
  const cards = pairs
    .map((pair) => {
      const sideA = reviewHtmlImagePath(pair.images[pair.presentation.optionA]);
      const sideB = reviewHtmlImagePath(pair.images[pair.presentation.optionB]);
      return `<section class="pair">
  <h2>${pair.id} — ${pair.mode} / ${pair.format} / ${pair.creativeLevel}</h2>
  <div class="grid">
    <figure><img src="${sideA}" alt="Option A" /><figcaption>Option A</figcaption></figure>
    <figure><img src="${sideB}" alt="Option B" /><figcaption>Option B</figcaption></figure>
  </div>
</section>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Image Harness Blind Gate Review</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0f1115; color: #e8eaed; }
    h1 { margin-bottom: 0.25rem; }
    p.note { color: #9aa0a6; max-width: 70ch; }
    .pair { margin: 2rem 0 3rem; padding-bottom: 2rem; border-bottom: 1px solid #2a2f3a; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    figure { margin: 0; }
    img { width: 100%; border-radius: 8px; border: 1px solid #2a2f3a; background: #1a1d24; }
    figcaption { margin-top: 0.5rem; font-weight: 600; text-align: center; }
  </style>
</head>
<body>
  <h1>Image Harness Blind Gate</h1>
  <p class="note">Compare Option A vs Option B for art direction and finish only. Record choices in <code>.planning/validation/image-harness-blind-gate.json</code>. Flag any objective-integrity regression (wrong brand, invented offer, format failure, style contamination).</p>
  ${cards}
</body>
</html>`;

  fs.writeFileSync(REVIEW_HTML_PATH, html);
}

function fidelityPresentation(mode: string): CreativeFidelityLevel[] {
  return [...FIDELITY_LEVELS].sort((a, b) =>
    createHash("sha256").update(`fidelity:${mode}:${a}`).digest("hex").localeCompare(
      createHash("sha256").update(`fidelity:${mode}:${b}`).digest("hex")
    )
  );
}

function writeFidelityReviewHtml(
  groups: Array<{
    mode: string;
    format: string;
    options: Array<{ label: string; image: string }>;
  }>
): void {
  const cards = groups.map((group) => `<section class="group">
  <h2>${group.mode} / ${group.format}</h2>
  <div class="grid">${group.options.map((option) => `<figure><img src="fidelity-matrix-images/${path.basename(option.image)}" alt="${option.label}" /><figcaption>${option.label}</figcaption></figure>`).join("\n")}</div>
</section>`).join("\n");
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Fidelity Matrix Round B</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#0f1115;color:#e8eaed}.group{margin:2rem 0 3rem}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}figure{margin:0}img{width:100%;border-radius:8px;border:1px solid #2a2f3a}figcaption{text-align:center;margin-top:.5rem;font-weight:600}.note{color:#9aa0a6;max-width:75ch}</style>
</head><body><h1>Fidelity Matrix — Round B</h1><p class="note">Sem consultar o JSON, identifique a opção mais conservadora e a mais extrema em cada modo. Os níveis intermediários são evidência diagnóstica, não hard gate.</p>${cards}</body></html>`;
  fs.writeFileSync(FIDELITY_REVIEW_HTML_PATH, html);
}

async function runFidelityMatrix(options: CliOptions): Promise<void> {
  const specs = fidelityMatrixSpecs();
  if (!options.dryRun && !options.skipRegen && !env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY required for live generation");
  }

  fs.mkdirSync(FIDELITY_IMAGES_DIR, { recursive: true });
  const openai = options.dryRun || options.skipRegen
    ? null
    : new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
  const outputs: Array<Record<string, unknown>> = [];

  for (const spec of specs) {
    const outputPath = path.join(FIDELITY_IMAGES_DIR, `${spec.id}.png`);
    const contract = buildContract(spec);
    if (options.dryRun) {
      await buildDerivationPrompt({
        ...derivationConfigFromContract(contract, { creativeLevel: spec.creativeLevel }),
        locale: LOCALE,
        feedback: null,
      });
      console.log(`validated ${spec.id}`);
    } else if (options.skipRegen && fs.existsSync(outputPath)) {
      console.log(`reused ${spec.id}`);
    } else {
      const buffer = await generateRecalibrated(spec, contract, openai!);
      fs.writeFileSync(outputPath, buffer);
      console.log(`generated ${spec.id} sha256=${sha256Buffer(buffer).slice(0, 8)}`);
    }
    outputs.push({
      id: spec.id,
      mode: spec.mode,
      format: spec.format,
      creativeLevel: spec.creativeLevel,
      image: repoRelativePath(outputPath),
    });
  }

  if (options.dryRun) return;

  const groups = ["art_variation", "format_adaptation", "restyling"].map((mode) => {
    const presentation = fidelityPresentation(mode);
    return {
      mode,
      format: mode === "format_adaptation" ? "9:16" : "1:1",
      options: presentation.map((level, index) => ({
        label: `Option ${String.fromCharCode(65 + index)}`,
        creativeLevel: level,
        image: outputs.find(
          (item) => item.mode === mode && item.creativeLevel === level
        )!.image as string,
      })),
      reviewerConservativeOption: null,
      reviewerExtremeOption: null,
    };
  });

  fs.writeFileSync(FIDELITY_EVIDENCE_PATH, `${JSON.stringify({
    status: "pending_human_review",
    generatedAt: new Date().toISOString(),
    criterion: "For each mode, a blind reviewer must correctly identify conservative and extreme. Intermediate ordering is diagnostic only.",
    reviewHtml: repoRelativePath(FIDELITY_REVIEW_HTML_PATH),
    groups,
  }, null, 2)}\n`);
  writeFidelityReviewHtml(groups);
  console.log(`Wrote evidence ${repoRelativePath(FIDELITY_EVIDENCE_PATH)}`);
  console.log(`Wrote review ${repoRelativePath(FIDELITY_REVIEW_HTML_PATH)}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.qaKnownRegressions) {
    await validateKnownRestylingRegressions(options.pairId);
    return;
  }
  if (options.regenerateKnownRegressions) {
    await regenerateKnownRestylingRegressions(options.pairId);
    return;
  }
  if (options.roundB) {
    await runFidelityMatrix(options);
    return;
  }
  const specs = options.pairId
    ? BLIND_GATE_PAIR_SPECS.filter((spec) => spec.id === options.pairId)
    : BLIND_GATE_PAIR_SPECS;

  if (specs.length === 0) {
    throw new Error(options.pairId ? `Unknown pair ${options.pairId}` : "No blind gate pairs configured");
  }

  if (!options.dryRun && !options.skipRegen && !env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY required for live generation");
  }

  fs.mkdirSync(BLIND_IMAGES_DIR, { recursive: true });
  const manifest = loadManifest();
  const openai = options.dryRun || options.skipRegen ? null : new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });

  const evidencePairs: Array<Record<string, unknown>> = [];
  const reviewPairs: Parameters<typeof writeReviewHtml>[0] = [];

  for (const spec of specs) {
    console.log(`pair ${spec.id} ${spec.mode} ${spec.format} ${spec.creativeLevel}`);

    const baselinePath = path.join(BLIND_IMAGES_DIR, `${spec.id}-baseline.png`);
    const recalibratedPath = path.join(BLIND_IMAGES_DIR, `${spec.id}-recalibrated.png`);

    const { buffer: baselineBuffer, source: baselineSource } = await resolveBaselineBuffer(spec, manifest);
    fs.writeFileSync(baselinePath, baselineBuffer);
    console.log(`  baseline ${baselineSource} sha256=${sha256Buffer(baselineBuffer).slice(0, 8)}`);

    if (options.dryRun) {
      console.log("  recalibrated skipped (dry-run)");
    } else if (options.skipRegen && fs.existsSync(recalibratedPath)) {
      console.log(`  recalibrated reused ${path.basename(recalibratedPath)}`);
    } else {
      const contract = buildContract(spec);
      const buffer = await generateRecalibrated(spec, contract, openai!);
      fs.writeFileSync(recalibratedPath, buffer);
      console.log(`  recalibrated generated sha256=${sha256Buffer(buffer).slice(0, 8)}`);
    }

    const presentation = presentationForPair(spec.id);
    const images = {
      baseline: repoRelativePath(baselinePath),
      recalibrated: repoRelativePath(recalibratedPath),
    };

    evidencePairs.push({
      id: spec.id,
      mode: spec.mode,
      format: spec.format,
      creativeLevel: spec.creativeLevel,
      canonicalSlug: spec.canonicalSlug,
      matrixKey: matrixKeyForSpec(spec),
      baselineImage: images.baseline,
      recalibratedImage: images.recalibrated,
      baselineSource,
      presentation: {
        optionA: { side: presentation.optionA, image: images[presentation.optionA] },
        optionB: { side: presentation.optionB, image: images[presentation.optionB] },
      },
      preferred: null,
      objectiveRegression: null,
    });

    reviewPairs.push({
      id: spec.id,
      mode: spec.mode,
      format: spec.format,
      creativeLevel: spec.creativeLevel,
      presentation,
      images,
    });
  }

  const evidence = {
    status: "pending_human_review",
    generatedAt: new Date().toISOString(),
    instructions: [
      "Open blind-gate-review.html and compare Option A vs Option B for each pair.",
      "Set preferred to baseline or recalibrated and objectiveRegression true/false in each pair.",
      "When all 12 pairs are decided, set status to completed and run check-image-harness-blind-gate.ts.",
    ],
    reviewHtml: repoRelativePath(REVIEW_HTML_PATH),
    pairs: evidencePairs,
  };

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  writeReviewHtml(reviewPairs);

  console.log(`Wrote evidence ${repoRelativePath(EVIDENCE_PATH)}`);
  console.log(`Wrote review ${repoRelativePath(REVIEW_HTML_PATH)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
