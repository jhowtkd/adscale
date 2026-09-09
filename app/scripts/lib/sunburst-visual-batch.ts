import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

export const CONTROL_MODEL = "gpt-image-2-2026-04-21" as const;
export const CANDIDATE_MODEL = "gpt-image-2.5-sunburst-2026-09-08" as const;
export const SMOKE_QUALITY = "medium" as const;
export const SMOKE_CALL_CAP = 12;
export const SMOKE_USD_CAP = 10;
export const FOLLOWUP_USD_CAP = 50;
export const REFERENCE_LIMIT = 4;
export const PRINCIPAL_GENERATE_IDS = ["piece-nike-just-do-it-4x5", "piece-absolut-perfection-4x5"] as const;
export const FOLLOWUP_BATCHES = ["principal", "sequences", "calibration"] as const;
export type FollowupBatchName = (typeof FOLLOWUP_BATCHES)[number];
export type BatchName = "smoke" | FollowupBatchName;

export const STANDARD_RATES_PER_MILLION = {
  textInput: 5,
  textInputCached: 1.25,
  imageInput: 8,
  imageInputCached: 2,
  imageOutput: 30,
} as const;

export type ImageRenderPolicy = {
  version: 1;
  model: typeof CONTROL_MODEL | typeof CANDIDATE_MODEL;
  quality: "medium" | "high" | "xhigh" | "max";
};

export type PlannedCall = {
  caseId: string;
  family: string;
  brand: string | null;
  slot: "control" | "candidate";
  policy: ImageRenderPolicy;
  prompt: string;
  operation: "edit" | "generate";
  dimensions: { width: number; height: number };
  sourcePaths: string[];
  blindLabel: "A" | "B";
  callKey?: string;
  chainId?: string;
};

export type UsageEstimate = {
  usd: number | null;
  basis: "detailed" | "conservative_all_input_as_image" | "unknown";
};

export type CatalogCase = {
  id: string;
  family: string;
  status: string;
  brand: string | null;
  instruction: string;
  revisionInstruction?: string;
  outputSize?: { width: number; height: number };
  sources?: Array<{ assetId: string; role: string; order: number }>;
};

export type CatalogAsset = { id: string; path: string; sha256: string };

export type Catalog = {
  cases: CatalogCase[];
  assets: CatalogAsset[];
  sunburstPercent?: number;
  batches?: {
    smokeCaseIds?: string[];
    calibrationCaseIds?: string[];
    sequenceStarts?: Array<{ id: string; baseAssetId: string; edits: string[] }>;
  };
};

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function estimateStandardUsd(usage: unknown): UsageEstimate {
  if (usage == null || typeof usage !== "object") return { usd: null, basis: "unknown" };
  const record = usage as Record<string, unknown>;
  const output = asFiniteNumber(record.output_tokens);
  const input = asFiniteNumber(record.input_tokens);
  if (output == null && input == null) return { usd: null, basis: "unknown" };
  const details = record.input_tokens_details;
  const detailRecord = details && typeof details === "object" ? (details as Record<string, unknown>) : null;
  const text = asFiniteNumber(detailRecord?.text_tokens);
  const image = asFiniteNumber(detailRecord?.image_tokens);
  const rates = STANDARD_RATES_PER_MILLION;
  if (text != null && image != null) {
    return {
      usd: (text * rates.textInput + image * rates.imageInput + (output ?? 0) * rates.imageOutput) / 1_000_000,
      basis: "detailed",
    };
  }
  return {
    usd: ((input ?? 0) * rates.imageInput + (output ?? 0) * rates.imageOutput) / 1_000_000,
    basis: "conservative_all_input_as_image",
  };
}

export function buildRevisionPolicyBlock(revisionInstruction?: string | null): string {
  return [
    "MODE POLICY — REVISION:",
    "Use the revision reference as the accepted base piece. Apply only the authorized change while honoring the original factual contract.",
    `AUTHORIZED CHANGE: ${revisionInstruction?.trim() || "No change authorized; preserve the base piece."}`,
    "PRESERVE UNLESS EXPLICITLY CHANGED: product geometry and labels, subject identity, brand assets, framing, composition, colors, and all approved copy outside the requested edit.",
    "Style references guide visual language only; they never authorize new facts, offers, prices, identities, or copy.",
    "Preservation describes visual intent, not a guarantee of identical pixels. Exact assets remain governed by the composition contract.",
  ].join("\n");
}

export function buildCasePrompt(entry: CatalogCase): string {
  if (entry.family === "review") {
    return `${buildRevisionPolicyBlock(entry.revisionInstruction)}\n${entry.instruction}`;
  }
  return entry.instruction;
}

export function generationModeFor(family: string): "art_variation" | "format_adaptation" | "restyling" {
  if (family === "adaptation") return "format_adaptation";
  if (family === "restyle") return "restyling";
  return "art_variation";
}

export function resolveSafe(root: string, relativePath: string): string {
  if (isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error(`unsafe path: ${relativePath}`);
  }
  const resolved = resolve(root, relativePath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path escapes root: ${relativePath}`);
  return resolved;
}

export function sourcePathsFor(entry: CatalogCase, assets: Map<string, CatalogAsset>): string[] {
  return [...(entry.sources ?? [])]
    .sort((left, right) => left.order - right.order)
    .slice(0, REFERENCE_LIMIT)
    .map((source) => {
      const asset = assets.get(source.assetId);
      if (!asset) throw new Error(`${entry.id} missing asset ${source.assetId}`);
      return asset.path;
    });
}

function pairLabels(coin: () => boolean): { control: "A" | "B"; candidate: "A" | "B" } {
  const controlFirst = coin();
  return { control: controlFirst ? "A" : "B", candidate: controlFirst ? "B" : "A" };
}

export function planSmokeCalls(catalog: Catalog, options: { coin?: () => boolean } = {}): PlannedCall[] {
  const ids = catalog.batches?.smokeCaseIds;
  if (!Array.isArray(ids) || ids.length !== 6) throw new Error("smoke requires 6 catalog case ids");
  const assets = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const coin = options.coin ?? (() => randomBytes(1)[0] % 2 === 0);
  const planned: PlannedCall[] = [];
  for (const id of ids) {
    const entry = catalog.cases.find((item) => item.id === id);
    if (!entry || entry.status !== "ready") throw new Error(`smoke case is not ready: ${id}`);
    const labels = pairLabels(coin);
    const sources = sourcePathsFor(entry, assets);
    if (sources.length === 0) throw new Error(`${id} has no references; smoke uses the product edit path`);
    const dimensions = entry.outputSize ?? { width: 1080, height: 1350 };
    const prompt = buildCasePrompt(entry);
    const base = { caseId: id, family: entry.family, brand: entry.brand, prompt, operation: "edit" as const, dimensions, sourcePaths: sources };
    planned.push({ ...base, slot: "control", policy: { version: 1, model: CONTROL_MODEL, quality: SMOKE_QUALITY }, blindLabel: labels.control });
    planned.push({ ...base, slot: "candidate", policy: { version: 1, model: CANDIDATE_MODEL, quality: SMOKE_QUALITY }, blindLabel: labels.candidate });
  }
  if (planned.length !== SMOKE_CALL_CAP) throw new Error(`smoke must plan ${SMOKE_CALL_CAP} calls`);
  return planned;
}

export function planPrincipalCalls(catalog: Catalog, options: { coin?: () => boolean } = {}): PlannedCall[] {
  const smoke = new Set(catalog.batches?.smokeCaseIds ?? []);
  const assets = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const coin = options.coin ?? (() => randomBytes(1)[0] % 2 === 0);
  const ready = catalog.cases.filter(
    (entry) => entry.status === "ready" && !smoke.has(entry.id) && entry.family !== "carousel",
  );
  const planned: PlannedCall[] = [];
  for (const entry of ready) {
    const labels = pairLabels(coin);
    const sources = sourcePathsFor(entry, assets);
    if (sources.length === 0) throw new Error(`${entry.id} ready case has no sources`);
    const dimensions = entry.outputSize ?? { width: 1080, height: 1350 };
    const prompt = buildCasePrompt(entry);
    const base = { caseId: entry.id, family: entry.family, brand: entry.brand, prompt, operation: "edit" as const, dimensions, sourcePaths: sources };
    planned.push({ ...base, slot: "control", policy: { version: 1, model: CONTROL_MODEL, quality: SMOKE_QUALITY }, blindLabel: labels.control, callKey: `${entry.id}-control-medium-edit` });
    planned.push({ ...base, slot: "candidate", policy: { version: 1, model: CANDIDATE_MODEL, quality: SMOKE_QUALITY }, blindLabel: labels.candidate, callKey: `${entry.id}-candidate-medium-edit` });
  }
  for (const id of PRINCIPAL_GENERATE_IDS) {
    const entry = catalog.cases.find((item) => item.id === id);
    if (!entry) throw new Error(`generate case missing: ${id}`);
    const labels = pairLabels(coin);
    const dimensions = entry.outputSize ?? { width: 1080, height: 1350 };
    const prompt = buildCasePrompt(entry);
    const base = { caseId: `${id}::generate`, family: entry.family, brand: entry.brand, prompt, operation: "generate" as const, dimensions, sourcePaths: [] };
    planned.push({ ...base, slot: "control", policy: { version: 1, model: CONTROL_MODEL, quality: SMOKE_QUALITY }, blindLabel: labels.control, callKey: `${id}-control-medium-generate` });
    planned.push({ ...base, slot: "candidate", policy: { version: 1, model: CANDIDATE_MODEL, quality: SMOKE_QUALITY }, blindLabel: labels.candidate, callKey: `${id}-candidate-medium-generate` });
  }
  return planned;
}

export function planSequenceCalls(catalog: Catalog, options: { coin?: () => boolean } = {}): PlannedCall[] {
  const sequences = catalog.batches?.sequenceStarts;
  if (!Array.isArray(sequences) || sequences.length !== 3) throw new Error("sequences require 3 starts");
  const assets = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const coin = options.coin ?? (() => randomBytes(1)[0] % 2 === 0);
  const planned: PlannedCall[] = [];
  for (const sequence of sequences) {
    const base = assets.get(sequence.baseAssetId);
    if (!base) throw new Error(`sequence ${sequence.id} missing base asset`);
    if (!Array.isArray(sequence.edits) || sequence.edits.length !== 3) throw new Error(`sequence ${sequence.id} needs 3 edits`);
    const brand = sequence.id.replace("sequence-", "");
    const labels = pairLabels(coin);
    for (const slot of ["control", "candidate"] as const) {
      const model = slot === "control" ? CONTROL_MODEL : CANDIDATE_MODEL;
      const chainId = `${sequence.id}:${slot}`;
      sequence.edits.forEach((edit, index) => {
        planned.push({
          caseId: `${sequence.id}-step-${index + 1}`,
          family: "review",
          brand,
          slot,
          policy: { version: 1, model, quality: SMOKE_QUALITY },
          prompt: `${buildRevisionPolicyBlock(edit)}\nUse the revision reference as the accepted base piece.`,
          operation: "edit",
          dimensions: { width: 1080, height: 1350 },
          sourcePaths: [base.path],
          blindLabel: labels[slot],
          callKey: `${sequence.id}-${slot}-step-${index + 1}`,
          chainId,
        });
      });
    }
  }
  return planned;
}

export function planNamedBatch(batch: BatchName, catalog: Catalog, options: { coin?: () => boolean } = {}): PlannedCall[] {
  if (batch === "smoke") return planSmokeCalls(catalog, options);
  if (batch === "principal") return planPrincipalCalls(catalog, options);
  if (batch === "sequences") return planSequenceCalls(catalog, options);
  return planCalibrationCalls(catalog, options);
}

export function readAccumulatedUsd(runsRoot: string, batches: readonly string[]): { usd: number; unknown: boolean } {
  let usd = 0;
  for (const batch of batches) {
    const statusPath = resolve(runsRoot, batch, "status.json");
    if (!existsSync(statusPath)) continue;
    const parsed = JSON.parse(readFileSync(statusPath, "utf8")) as { usdSpent?: unknown; status?: unknown };
    if (parsed.status === "dry_run") continue;
    if (parsed.usdSpent == null) return { usd: 0, unknown: true };
    const value = asFiniteNumber(parsed.usdSpent);
    if (value == null) return { usd: 0, unknown: true };
    usd += value;
  }
  return { usd, unknown: false };
}

export function planCalibrationCalls(catalog: Catalog, options: { coin?: () => boolean } = {}): PlannedCall[] {
  const ids = catalog.batches?.calibrationCaseIds;
  if (!Array.isArray(ids) || ids.length !== 6) throw new Error("calibration requires 6 cases");
  const assets = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const coin = options.coin ?? (() => randomBytes(1)[0] % 2 === 0);
  const planned: PlannedCall[] = [];
  for (const id of ids) {
    const entry = catalog.cases.find((item) => item.id === id);
    if (!entry || entry.status !== "ready") throw new Error(`calibration case is not ready: ${id}`);
    const sources = sourcePathsFor(entry, assets);
    const dimensions = entry.outputSize ?? { width: 1080, height: 1350 };
    const prompt = buildCasePrompt(entry);
    const labels = pairLabels(coin);
    planned.push({
      caseId: id,
      family: entry.family,
      brand: entry.brand,
      slot: "control",
      policy: { version: 1, model: CONTROL_MODEL, quality: "high" },
      prompt,
      operation: "edit",
      dimensions,
      sourcePaths: sources,
      blindLabel: labels.control,
      callKey: `${id}-control-high-edit`,
    });
    for (const quality of ["high", "xhigh", "max"] as const) {
      planned.push({
        caseId: id,
        family: entry.family,
        brand: entry.brand,
        slot: "candidate",
        policy: { version: 1, model: CANDIDATE_MODEL, quality },
        prompt,
        operation: "edit",
        dimensions,
        sourcePaths: sources,
        blindLabel: quality === "high" ? labels.candidate : "B",
        callKey: `${id}-candidate-${quality}-edit`,
      });
    }
  }
  return planned;
}

export function shouldStopBatch(input: {
  callsCompleted: number;
  callCap: number;
  usdSpent: number | null;
  usdCap: number;
  lastUsageUnknown: boolean;
}): { stop: boolean; reason: string | null } {
  if (input.lastUsageUnknown) return { stop: true, reason: "usage_unknown" };
  if (input.usdSpent != null && input.usdSpent >= input.usdCap) return { stop: true, reason: "usd_cap" };
  if (input.callsCompleted >= input.callCap) return { stop: true, reason: "call_cap" };
  return { stop: false, reason: null };
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function assertBinaries(binariesRoot: string, paths: string[]): void {
  for (const relativePath of paths) {
    const filePath = resolveSafe(binariesRoot, relativePath);
    if (!existsSync(filePath)) throw new Error(`missing binary: ${relativePath}`);
  }
}

export type BatchGenerateFn = (input: {
  prompt: string;
  dimensions: { width: number; height: number };
  referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  outputPrefix: string;
  renderPolicy: ImageRenderPolicy;
}) => Promise<{
  buffer: Buffer;
  mimeType: string;
  providerMeta: {
    model: string;
    durationMs: number;
    rawRequestId?: string;
    observation?: { callId?: string; operation?: string; usage?: unknown; requestedSize?: string; returnedSize?: string | null };
  };
}>;

export type BatchResult = { status: string; planned: PlannedCall[]; calls: unknown[]; usdSpent: number | null; stopReason: string | null };

export async function executePlannedCalls(input: {
  batch: string;
  planned: PlannedCall[];
  binariesRoot: string;
  outDir: string;
  confirmPaid: boolean;
  dryRun: boolean;
  callCap: number;
  usdCap: number;
  usdSpentStart?: number;
  generate?: BatchGenerateFn;
  normalize?: (buffer: Buffer) => Promise<{ buffer: Buffer; mimeType: string }>;
}): Promise<BatchResult> {
  if (!input.dryRun && !input.confirmPaid) throw new Error("refusing paid calls without --confirm-paid");
  if (!input.dryRun && !input.generate) throw new Error("paid run requires a product generate function");
  for (const call of input.planned) assertBinaries(input.binariesRoot, call.sourcePaths);
  mkdirSync(input.outDir, { recursive: true });
  mkdirSync(resolve(input.outDir, "images"), { recursive: true });
  if (input.dryRun) {
    const report = {
      status: "dry_run",
      batch: input.batch,
      sunburstPercent: 0,
      callCap: input.callCap,
      usdCap: input.usdCap,
      planned: input.planned.map((call) => ({
        caseId: call.caseId,
        slot: call.slot,
        model: call.policy.model,
        quality: call.policy.quality,
        operation: call.operation,
        blindLabel: call.blindLabel,
        sourceCount: call.sourcePaths.length,
        callKey: call.callKey ?? null,
      })),
      calls: [],
      usdSpent: null,
      stopReason: null,
    };
    writeFileSync(resolve(input.outDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
    return { status: "dry_run", planned: input.planned, calls: [], usdSpent: null, stopReason: null };
  }

  const calls: unknown[] = [];
  const spentBefore = input.usdSpentStart ?? 0;
  let batchUsd = 0;
  let lastUsageUnknown = false;
  let stopReason: string | null = null;
  const chainBuffers = new Map<string, Buffer>();

  for (const call of input.planned) {
    const halt = shouldStopBatch({
      callsCompleted: calls.length,
      callCap: input.callCap,
      usdSpent: spentBefore + batchUsd,
      usdCap: input.usdCap,
      lastUsageUnknown,
    });
    if (halt.stop) {
      stopReason = halt.reason;
      break;
    }

    const referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }> = [];
    const chained = Boolean(call.chainId && chainBuffers.has(call.chainId));
    if (chained) {
      referenceImages.push({ buffer: chainBuffers.get(call.chainId!)!, mimeType: "image/png", name: "previous.png" });
    }
    const sourcePaths = call.operation === "generate" ? [] : chained ? call.sourcePaths.slice(1) : call.sourcePaths;
    for (const sourcePath of sourcePaths) {
      if (referenceImages.length >= REFERENCE_LIMIT) break;
      const original = readFileSync(resolveSafe(input.binariesRoot, sourcePath));
      const normalized = input.normalize
        ? await input.normalize(original)
        : { buffer: original, mimeType: sourcePath.endsWith(".png") ? "image/png" : "image/jpeg" };
      referenceImages.push({ buffer: normalized.buffer, mimeType: normalized.mimeType, name: basename(sourcePath) });
    }
    if (call.operation === "edit" && referenceImages.length === 0) {
      throw new Error(`${call.caseId} edit call has no references`);
    }

    let result;
    try {
      result = await input.generate!({
        prompt: call.prompt,
        dimensions: call.dimensions,
        referenceImages,
        generationMode: generationModeFor(call.family),
        outputPrefix: `sunburst-${input.batch}/${call.callKey ?? `${call.caseId}/${call.slot}`}`,
        renderPolicy: call.policy,
      });
    } catch (error) {
      lastUsageUnknown = true;
      calls.push({
        caseId: call.caseId,
        slot: call.slot,
        model: call.policy.model,
        quality: call.policy.quality,
        operation: call.operation,
        blindLabel: call.blindLabel,
        requestId: null,
        durationMs: null,
        usage: null,
        usageEstimate: { usd: null, basis: "unknown" },
        error: error instanceof Error ? error.message : String(error),
        billing: "unknown",
      });
      stopReason = "provider_error";
      console.log(`SUNBURST-BATCH: ${input.batch} error ${call.callKey ?? call.caseId}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }

    const usage = result.providerMeta.observation?.usage ?? null;
    const estimate = estimateStandardUsd(usage);
    if (estimate.usd == null) lastUsageUnknown = true;
    else batchUsd += estimate.usd;
    if (call.chainId) chainBuffers.set(call.chainId, result.buffer);

    const imageName = `${call.callKey ?? `${call.caseId}-${call.blindLabel}`}.png`;
    writeFileSync(resolve(input.outDir, "images", imageName), result.buffer);
    calls.push({
      caseId: call.caseId,
      slot: call.slot,
      model: call.policy.model,
      quality: call.policy.quality,
      operation: result.providerMeta.observation?.operation ?? call.operation,
      blindLabel: call.blindLabel,
      requestId: result.providerMeta.rawRequestId ?? result.providerMeta.observation?.callId ?? null,
      durationMs: result.providerMeta.durationMs,
      usage,
      usageEstimate: estimate,
      sha256: sha256Buffer(result.buffer),
      bytes: result.buffer.byteLength,
      image: `images/${imageName}`,
      requestedSize: result.providerMeta.observation?.requestedSize ?? null,
      returnedSize: result.providerMeta.observation?.returnedSize ?? null,
    });
    console.log(
      `SUNBURST-BATCH: ${input.batch} ${calls.length}/${input.planned.length} ${call.callKey ?? call.caseId} ${call.policy.quality} usd=${batchUsd.toFixed(4)} ${result.providerMeta.durationMs}ms`,
    );
  }

  if (!stopReason) {
    const halt = shouldStopBatch({
      callsCompleted: calls.length,
      callCap: input.callCap,
      usdSpent: lastUsageUnknown ? null : spentBefore + batchUsd,
      usdCap: input.usdCap,
      lastUsageUnknown,
    });
    stopReason = halt.reason;
  }

  const completed = !lastUsageUnknown && calls.length === input.planned.length;
  const report = {
    status: lastUsageUnknown ? "stopped_usage_unknown" : completed ? "completed" : "stopped",
    batch: input.batch,
    sunburstPercent: 0,
    callCap: input.callCap,
    usdCap: input.usdCap,
    usdSpent: lastUsageUnknown ? null : batchUsd,
    usdSpentBefore: spentBefore,
    stopReason: completed ? null : stopReason,
    calls,
    blindKey: input.planned.map((call) => ({ caseId: call.caseId, slot: call.slot, model: call.policy.model, quality: call.policy.quality, blindLabel: call.blindLabel, callKey: call.callKey ?? null })),
  };
  writeFileSync(resolve(input.outDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeReviewHtml(input.outDir, input.batch, input.planned, calls as Array<{ caseId: string; blindLabel: string; image: string; quality?: string }>);
  return { status: report.status, planned: input.planned, calls, usdSpent: report.usdSpent, stopReason: report.stopReason };
}

export async function runNamedBatch(input: {
  batch: BatchName;
  catalog: Catalog;
  binariesRoot: string;
  outDir: string;
  confirmPaid: boolean;
  dryRun: boolean;
  usdSpentStart?: number;
  usdCap?: number;
  generate?: BatchGenerateFn;
  normalize?: (buffer: Buffer) => Promise<{ buffer: Buffer; mimeType: string }>;
  coin?: () => boolean;
}): Promise<BatchResult> {
  if (input.catalog.sunburstPercent != null && input.catalog.sunburstPercent !== 0) {
    throw new Error("sunburst percent must remain 0");
  }
  const planned = planNamedBatch(input.batch, input.catalog, { coin: input.coin });
  return executePlannedCalls({
    batch: input.batch,
    planned,
    binariesRoot: input.binariesRoot,
    outDir: input.outDir,
    confirmPaid: input.confirmPaid,
    dryRun: input.dryRun,
    callCap: planned.length,
    usdCap: input.usdCap ?? (input.batch === "smoke" ? SMOKE_USD_CAP : FOLLOWUP_USD_CAP),
    usdSpentStart: input.usdSpentStart,
    generate: input.generate,
    normalize: input.normalize,
  });
}

export async function runSmokeBatch(input: {
  catalog: Catalog;
  binariesRoot: string;
  outDir: string;
  confirmPaid: boolean;
  dryRun: boolean;
  generate?: BatchGenerateFn;
  normalize?: (buffer: Buffer) => Promise<{ buffer: Buffer; mimeType: string }>;
  coin?: () => boolean;
}): Promise<BatchResult> {
  return runNamedBatch({ ...input, batch: "smoke" });
}

function writeReviewHtml(
  outDir: string,
  batch: string,
  planned: PlannedCall[],
  calls: Array<{ caseId: string; blindLabel: string; image: string; quality?: string }>,
) {
  const caseIds = [...new Set(planned.map((call) => call.caseId))];
  const rows = caseIds.map((caseId) => {
    const a = calls.find((call) => call.caseId === caseId && call.blindLabel === "A");
    const b = calls.find((call) => call.caseId === caseId && call.blindLabel === "B");
    const extras = calls.filter((call) => call.caseId === caseId && call !== a && call !== b);
    const extraHtml = extras
      .map((call) => `<figure><img src="${call.image}" alt="${call.quality ?? call.blindLabel}"><figcaption>${call.quality ?? call.blindLabel}</figcaption></figure>`)
      .join("");
    return `<section><h2>${caseId}</h2><div class="pair"><figure><img src="${a?.image ?? ""}" alt="A"><figcaption>A</figcaption></figure><figure><img src="${b?.image ?? ""}" alt="B"><figcaption>B</figcaption></figure>${extraHtml}</div></section>`;
  });
  writeFileSync(
    resolve(outDir, "review.html"),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Sunburst ${batch} — revisão cega</title><style>body{font-family:sans-serif;max-width:1100px;margin:2rem auto}img{max-width:100%;height:auto}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}</style></head><body><p>Modelos ocultos. Julgue a 100% do tamanho de entrega.</p>${rows.join("")}</body></html>\n`,
  );
}
