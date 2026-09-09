import "./register-server-stub";
import "./load-sunburst-batch-env";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeCreativeWorkReferenceImage } from "@/server/creative-work/reference-normalize";

import {
  FOLLOWUP_BATCHES,
  FOLLOWUP_USD_CAP,
  readAccumulatedUsd,
  runNamedBatch,
  type BatchGenerateFn,
  type BatchName,
} from "./lib/sunburst-visual-batch";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "..");

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function isBatchName(value: string): value is BatchName {
  return value === "smoke" || (FOLLOWUP_BATCHES as readonly string[]).includes(value);
}

function writeStatus(outDir: string, result: { status: string; stopReason: string | null; usdSpent: number | null; calls: unknown[] }) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "status.json"),
    `${JSON.stringify({ status: result.status, stopReason: result.stopReason, usdSpent: result.usdSpent, calls: result.calls.length }, null, 2)}\n`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const confirmPaid = argv.includes("--confirm-paid");
  const dryRun = argv.includes("--dry-run") || !confirmPaid;
  const requested = argValue(argv, "--batch") ?? "smoke";
  const remaining = requested === "remaining";
  if (!remaining && !isBatchName(requested)) {
    console.error("SUNBURST-BATCH: --batch must be smoke|principal|sequences|calibration|remaining");
    process.exitCode = 1;
    return;
  }
  if (process.env.E2E_CONTROLLED_PROVIDER === "true" || process.env.E2E_CONTROLLED_PROVIDER_PREVIEW === "true") {
    console.error("SUNBURST-BATCH: refusing the E2E controlled provider");
    process.exitCode = 1;
    return;
  }
  const percent = Number(process.env.OPENAI_IMAGE_SUNBURST_PERCENT ?? "0");
  if (percent !== 0) {
    console.error("SUNBURST-BATCH: OPENAI_IMAGE_SUNBURST_PERCENT must stay 0");
    process.exitCode = 1;
    return;
  }

  const catalogPath = resolve(argValue(argv, "--catalog") ?? resolve(REPO_ROOT, "docs/evidence/2026-09-08-sunburst-visual-corpus.json"));
  const binariesRoot = resolve(argValue(argv, "--binaries-root") ?? REPO_ROOT);
  const runsRoot = resolve(argValue(argv, "--runs-root") ?? resolve(REPO_ROOT, "docs/evidence/sunburst-visual-runs"));
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const batches: BatchName[] = remaining ? [...FOLLOWUP_BATCHES] : [requested];

  let generate: BatchGenerateFn | undefined;
  if (!dryRun) {
    const { OpenAIImageProvider } = await import("@/server/ai/providers/openai-image-provider");
    const provider = new OpenAIImageProvider();
    generate = async (input) =>
      provider.generate({
        prompt: input.prompt,
        dimensions: input.dimensions,
        referenceImages: input.referenceImages,
        generationMode: input.generationMode,
        outputPrefix: input.outputPrefix,
        renderPolicy: input.renderPolicy,
      });
  }

  const normalize = async (buffer: Buffer) => {
    const normalized = await normalizeCreativeWorkReferenceImage({ buffer });
    return { buffer: normalized.buffer, mimeType: normalized.mimeType };
  };

  let usdSpentStart = 0;
  if (!dryRun && batches.some((batch) => batch !== "smoke")) {
    const prior = readAccumulatedUsd(runsRoot, FOLLOWUP_BATCHES);
    if (prior.unknown) {
      console.error("SUNBURST-BATCH: previous follow-up usage is unknown; refusing to spend more");
      process.exitCode = 1;
      return;
    }
    usdSpentStart = prior.usd;
    if (usdSpentStart >= FOLLOWUP_USD_CAP) {
      console.error(`SUNBURST-BATCH: follow-up cap already reached (${usdSpentStart})`);
      process.exitCode = 1;
      return;
    }
  }

  for (const batch of batches) {
    const outDir =
      batches.length === 1 && argValue(argv, "--out")
        ? resolve(argValue(argv, "--out")!)
        : resolve(runsRoot, batch);
    if (remaining && !dryRun) {
      const priorStatusPath = resolve(runsRoot, batch, "status.json");
      try {
        const priorStatus = JSON.parse(readFileSync(priorStatusPath, "utf8")) as { status?: string };
        if (priorStatus.status === "completed") {
          console.log(`SUNBURST-BATCH: ${batch} already completed; skipping`);
          continue;
        }
      } catch {
        // Batch has not been run yet.
      }
    }
    const result = await runNamedBatch({
      batch,
      catalog,
      binariesRoot,
      outDir,
      confirmPaid,
      dryRun,
      usdSpentStart: batch === "smoke" ? 0 : usdSpentStart,
      usdCap: batch === "smoke" ? undefined : FOLLOWUP_USD_CAP,
      generate,
      normalize,
    });
    writeStatus(outDir, result);
    console.log(`SUNBURST-BATCH: ${batch} ${result.status} calls=${result.calls.length} usd=${result.usdSpent ?? "unknown"} stop=${result.stopReason ?? "none"}`);
    if (dryRun) continue;
    if (result.usdSpent == null || result.status !== "completed") {
      process.exitCode = 1;
      return;
    }
    if (batch !== "smoke") usdSpentStart += result.usdSpent;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SUNBURST-BATCH: ${message}`);
  process.exitCode = 1;
});
