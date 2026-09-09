import "./register-server-stub";
import "./load-sunburst-batch-env";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeCreativeWorkReferenceImage } from "@/server/creative-work/reference-normalize";

import { runSmokeBatch } from "./lib/sunburst-visual-batch";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "..");

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const confirmPaid = argv.includes("--confirm-paid");
  const dryRun = argv.includes("--dry-run") || !confirmPaid;
  const batch = argValue(argv, "--batch") ?? "smoke";
  if (batch !== "smoke") {
    console.error("SUNBURST-BATCH: only --batch smoke is implemented");
    process.exitCode = 1;
    return;
  }
  if (process.env.E2E_CONTROLLED_PROVIDER === "true") {
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
  const outDir = resolve(argValue(argv, "--out") ?? resolve(REPO_ROOT, "docs/evidence/sunburst-visual-runs/smoke"));
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

  let generate;
  if (!dryRun) {
    const { OpenAIImageProvider } = await import("@/server/ai/providers/openai-image-provider");
    const provider = new OpenAIImageProvider();
    generate = async (input: Parameters<NonNullable<Parameters<typeof runSmokeBatch>[0]["generate"]>>[0]) =>
      provider.generate({
        prompt: input.prompt,
        dimensions: input.dimensions,
        referenceImages: input.referenceImages,
        generationMode: input.generationMode,
        outputPrefix: input.outputPrefix,
        renderPolicy: input.renderPolicy,
      });
  }

  const result = await runSmokeBatch({
    catalog,
    binariesRoot,
    outDir,
    confirmPaid,
    dryRun,
    generate,
    normalize: async (buffer) => {
      const normalized = await normalizeCreativeWorkReferenceImage({ buffer });
      return { buffer: normalized.buffer, mimeType: normalized.mimeType };
    },
  });

  mkdirSync(dirname(resolve(outDir, "manifest.json")), { recursive: true });
  writeFileSync(
    resolve(outDir, "status.json"),
    `${JSON.stringify({ status: result.status, stopReason: result.stopReason, usdSpent: result.usdSpent, calls: result.calls.length }, null, 2)}\n`,
  );
  console.log(`SUNBURST-BATCH: ${result.status} calls=${result.calls.length} usd=${result.usdSpent ?? "unknown"} stop=${result.stopReason ?? "none"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SUNBURST-BATCH: ${message}`);
  process.exitCode = 1;
});
