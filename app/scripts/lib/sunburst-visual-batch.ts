import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

export const CONTROL_MODEL = "gpt-image-2-2026-04-21" as const;
export const CANDIDATE_MODEL = "gpt-image-2.5-sunburst-2026-09-08" as const;
export const SMOKE_QUALITY = "medium" as const;
export const SMOKE_CALL_CAP = 12;
export const SMOKE_USD_CAP = 10;
export const REFERENCE_LIMIT = 4;

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
  operation: "edit";
  dimensions: { width: number; height: number };
  sourcePaths: string[];
  blindLabel: "A" | "B";
};

export type UsageEstimate = {
  usd: number | null;
  basis: "detailed" | "conservative_all_input_as_image" | "unknown";
};

type CatalogCase = {
  id: string;
  family: string;
  status: string;
  brand: string | null;
  instruction: string;
  revisionInstruction?: string;
  outputSize?: { width: number; height: number };
  sources?: Array<{ assetId: string; role: string; order: number }>;
};

type CatalogAsset = { id: string; path: string; sha256: string };

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

function resolveSafe(root: string, relativePath: string): string {
  if (isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error(`unsafe path: ${relativePath}`);
  }
  const resolved = resolve(root, relativePath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path escapes root: ${relativePath}`);
  return resolved;
}

export function planSmokeCalls(catalog: {
  cases: CatalogCase[];
  assets: CatalogAsset[];
  batches?: { smokeCaseIds?: string[] };
}, options: { coin?: () => boolean } = {}): PlannedCall[] {
  const ids = catalog.batches?.smokeCaseIds;
  if (!Array.isArray(ids) || ids.length !== 6) throw new Error("smoke requires 6 catalog case ids");
  const assets = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const coin = options.coin ?? (() => randomBytes(1)[0] % 2 === 0);
  const planned: PlannedCall[] = [];

  for (const id of ids) {
    const entry = catalog.cases.find((item) => item.id === id);
    if (!entry || entry.status !== "ready") throw new Error(`smoke case is not ready: ${id}`);
    const controlFirst = coin();
    const controlLabel: "A" | "B" = controlFirst ? "A" : "B";
    const candidateLabel: "A" | "B" = controlFirst ? "B" : "A";
    const sources = [...(entry.sources ?? [])]
      .sort((left, right) => left.order - right.order)
      .slice(0, REFERENCE_LIMIT)
      .map((source) => {
        const asset = assets.get(source.assetId);
        if (!asset) throw new Error(`${id} missing asset ${source.assetId}`);
        return asset.path;
      });
    if (sources.length === 0) throw new Error(`${id} has no references; smoke uses the product edit path`);
    const dimensions = entry.outputSize ?? { width: 1080, height: 1350 };
    const prompt = buildCasePrompt(entry);
    const base = { caseId: id, family: entry.family, brand: entry.brand, prompt, operation: "edit" as const, dimensions, sourcePaths: sources };
    planned.push({
      ...base,
      slot: "control",
      policy: { version: 1, model: CONTROL_MODEL, quality: SMOKE_QUALITY },
      blindLabel: controlLabel,
    });
    planned.push({
      ...base,
      slot: "candidate",
      policy: { version: 1, model: CANDIDATE_MODEL, quality: SMOKE_QUALITY },
      blindLabel: candidateLabel,
    });
  }

  if (planned.length !== SMOKE_CALL_CAP) throw new Error(`smoke must plan ${SMOKE_CALL_CAP} calls`);
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

export async function runSmokeBatch(input: {
  catalog: { cases: CatalogCase[]; assets: CatalogAsset[]; batches?: { smokeCaseIds?: string[] }; sunburstPercent?: number };
  binariesRoot: string;
  outDir: string;
  confirmPaid: boolean;
  dryRun: boolean;
  generate?: BatchGenerateFn;
  normalize?: (buffer: Buffer) => Promise<{ buffer: Buffer; mimeType: string }>;
  coin?: () => boolean;
}): Promise<{ status: string; planned: PlannedCall[]; calls: unknown[]; usdSpent: number | null; stopReason: string | null }> {
  if (input.catalog.sunburstPercent != null && input.catalog.sunburstPercent !== 0) {
    throw new Error("sunburst percent must remain 0");
  }
  if (!input.dryRun && !input.confirmPaid) throw new Error("refusing paid calls without --confirm-paid");
  if (!input.dryRun && !input.generate) throw new Error("paid run requires a product generate function");

  const planned = planSmokeCalls(input.catalog, { coin: input.coin });
  for (const call of planned) assertBinaries(input.binariesRoot, call.sourcePaths);

  mkdirSync(input.outDir, { recursive: true });
  mkdirSync(resolve(input.outDir, "images"), { recursive: true });

  if (input.dryRun) {
    const report = {
      status: "dry_run",
      batch: "smoke",
      paidCallsAuthorized: false,
      sunburstPercent: 0,
      callCap: SMOKE_CALL_CAP,
      usdCap: SMOKE_USD_CAP,
      planned: planned.map((call) => ({
        caseId: call.caseId,
        slot: call.slot,
        model: call.policy.model,
        quality: call.policy.quality,
        operation: call.operation,
        blindLabel: call.blindLabel,
        sourceCount: call.sourcePaths.length,
      })),
      calls: [],
      usdSpent: null,
      stopReason: null,
    };
    writeFileSync(resolve(input.outDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
    return { status: "dry_run", planned, calls: [], usdSpent: null, stopReason: null };
  }

  const calls: unknown[] = [];
  let usdSpent = 0;
  let lastUsageUnknown = false;
  let stopReason: string | null = null;

  for (const call of planned) {
    const halt = shouldStopBatch({
      callsCompleted: calls.length,
      callCap: SMOKE_CALL_CAP,
      usdSpent,
      usdCap: SMOKE_USD_CAP,
      lastUsageUnknown,
    });
    if (halt.stop) {
      stopReason = halt.reason;
      break;
    }

    const referenceImages = [];
    for (const sourcePath of call.sourcePaths) {
      const absolute = resolveSafe(input.binariesRoot, sourcePath);
      const original = readFileSync(absolute);
      const normalized = input.normalize
        ? await input.normalize(original)
        : { buffer: original, mimeType: sourcePath.endsWith(".png") ? "image/png" : "image/jpeg" };
      referenceImages.push({
        buffer: normalized.buffer,
        mimeType: normalized.mimeType,
        name: basename(sourcePath),
      });
    }

    const result = await input.generate!({
      prompt: call.prompt,
      dimensions: call.dimensions,
      referenceImages,
      generationMode: generationModeFor(call.family),
      outputPrefix: `sunburst-smoke/${call.caseId}/${call.slot}`,
      renderPolicy: call.policy,
    });

    const usage = result.providerMeta.observation?.usage ?? null;
    const estimate = estimateStandardUsd(usage);
    if (estimate.usd == null) lastUsageUnknown = true;
    else usdSpent += estimate.usd;

    const imageName = `${call.caseId}-${call.blindLabel}.png`;
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
  }

  if (!stopReason) {
    const halt = shouldStopBatch({
      callsCompleted: calls.length,
      callCap: SMOKE_CALL_CAP,
      usdSpent: lastUsageUnknown ? null : usdSpent,
      usdCap: SMOKE_USD_CAP,
      lastUsageUnknown,
    });
    stopReason = halt.reason;
  }

  const report = {
    status: lastUsageUnknown ? "stopped_usage_unknown" : calls.length === SMOKE_CALL_CAP ? "completed" : "stopped",
    batch: "smoke",
    sunburstPercent: 0,
    callCap: SMOKE_CALL_CAP,
    usdCap: SMOKE_USD_CAP,
    usdSpent: lastUsageUnknown ? null : usdSpent,
    stopReason,
    calls,
    blindKey: planned.map((call) => ({ caseId: call.caseId, slot: call.slot, model: call.policy.model, blindLabel: call.blindLabel })),
  };
  writeFileSync(resolve(input.outDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeReviewHtml(input.outDir, planned, calls as Array<{ caseId: string; blindLabel: string; image: string }>);
  return { status: report.status, planned, calls, usdSpent: report.usdSpent, stopReason };
}

function writeReviewHtml(outDir: string, planned: PlannedCall[], calls: Array<{ caseId: string; blindLabel: string; image: string }>) {
  const caseIds = [...new Set(planned.map((call) => call.caseId))];
  const rows = caseIds.map((caseId) => {
    const a = calls.find((call) => call.caseId === caseId && call.blindLabel === "A");
    const b = calls.find((call) => call.caseId === caseId && call.blindLabel === "B");
    return `<section><h2>${caseId}</h2><div class="pair"><figure><img src="${a?.image ?? ""}" alt="A"><figcaption>A</figcaption></figure><figure><img src="${b?.image ?? ""}" alt="B"><figcaption>B</figcaption></figure></div></section>`;
  });
  writeFileSync(
    resolve(outDir, "review.html"),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Sunburst smoke — revisão cega</title><style>body{font-family:sans-serif;max-width:1100px;margin:2rem auto}img{max-width:100%;height:auto}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}</style></head><body><p>Modelos ocultos. Julgue A/B a 100% do tamanho de entrega.</p>${rows.join("")}</body></html>\n`,
  );
}
