import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  CANDIDATE_MODEL,
  CONTROL_MODEL,
  FOLLOWUP_USD_CAP,
  SMOKE_CALL_CAP,
  buildCasePrompt,
  estimateStandardUsd,
  executePlannedCalls,
  planCalibrationCalls,
  planNamedBatch,
  planPrincipalCalls,
  planSequenceCalls,
  planSmokeCalls,
  readAccumulatedUsd,
  runSmokeBatch,
  shouldStopBatch,
  type Catalog,
} from "./sunburst-visual-batch";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CORPUS_PATH = resolve(REPO_ROOT, "docs/evidence/2026-09-08-sunburst-visual-corpus.json");

function catalog(): Catalog {
  const assets = [
    { id: "nike", path: "docs/originals/nike.jpg", sha256: "n" },
    { id: "mtv", path: "docs/originals/mtv.jpg", sha256: "m" },
    { id: "absolut", path: "docs/originals/absolut.jpg", sha256: "a" },
    { id: "result-nike", path: "docs/results/nike.png", sha256: "rn" },
    { id: "result-mtv", path: "docs/results/mtv.png", sha256: "rm" },
    { id: "result-absolut", path: "docs/results/absolut.png", sha256: "ra" },
  ];
  const cases = [
    smokeCase("piece-nike-just-do-it-4x5", "piece", "nike"),
    smokeCase("piece-mtv-network-id-4x5", "piece", "mtv"),
    smokeCase("piece-absolut-perfection-4x5", "piece", "absolut"),
    smokeCase("variation-mtv-skin-change", "variation", "mtv"),
    smokeCase("restyle-absolut-keep-bottle", "restyle", "absolut"),
    smokeCase("review-nike-copy-only", "review", "nike"),
    smokeCase("piece-nike-walt-stack-system", "piece", "nike"),
    {
      id: "carousel-cover",
      family: "carousel",
      status: "blocked",
      brand: "mtv",
      instruction: "Do not call",
      sources: [],
    },
  ];
  return {
    sunburstPercent: 0,
    assets,
    cases,
    batches: {
      smokeCaseIds: [
        "piece-nike-just-do-it-4x5",
        "piece-mtv-network-id-4x5",
        "piece-absolut-perfection-4x5",
        "variation-mtv-skin-change",
        "restyle-absolut-keep-bottle",
        "review-nike-copy-only",
      ],
      calibrationCaseIds: [
        "piece-nike-just-do-it-4x5",
        "piece-mtv-network-id-4x5",
        "piece-absolut-perfection-4x5",
        "variation-mtv-skin-change",
        "restyle-absolut-keep-bottle",
        "review-nike-copy-only",
      ],
      sequenceStarts: [
        { id: "sequence-nike", baseAssetId: "result-nike", edits: ["a", "b", "c"] },
        { id: "sequence-mtv", baseAssetId: "result-mtv", edits: ["a", "b", "c"] },
        { id: "sequence-absolut", baseAssetId: "result-absolut", edits: ["a", "b", "c"] },
      ],
    },
  };
}

function smokeCase(id: string, family: string, brand: "nike" | "mtv" | "absolut") {
  return {
    id,
    family,
    status: "ready",
    brand,
    instruction: `Literal ${id}`,
    revisionInstruction: family === "review" ? "Troque somente a chamada visível para JUST DO IT." : undefined,
    outputSize: { width: 1080, height: 1350 },
    sources: [{ assetId: brand, role: family === "review" ? "revision" : "brand_identity", order: 1 }],
  };
}

function binariesRoot() {
  const root = mkdtempSync(join(tmpdir(), "sunburst-smoke-bin-"));
  mkdirSync(join(root, "docs/originals"), { recursive: true });
  mkdirSync(join(root, "docs/results"), { recursive: true });
  writeFileSync(join(root, "docs/originals/nike.jpg"), "nike");
  writeFileSync(join(root, "docs/originals/mtv.jpg"), "mtv");
  writeFileSync(join(root, "docs/originals/absolut.jpg"), "absolut");
  writeFileSync(join(root, "docs/results/nike.png"), "nike-out");
  writeFileSync(join(root, "docs/results/mtv.png"), "mtv-out");
  writeFileSync(join(root, "docs/results/absolut.png"), "absolut-out");
  return root;
}

function okGenerate(label = "png") {
  return vi.fn().mockResolvedValue({
    buffer: Buffer.from(label),
    mimeType: "image/png",
    providerMeta: {
      model: CONTROL_MODEL,
      durationMs: 10,
      observation: {
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          input_tokens_details: { text_tokens: 20, image_tokens: 80 },
        },
      },
    },
  });
}

describe("sunburst visual smoke planner", () => {
  it("plans 12 product-path edit calls at medium for both models", () => {
    const planned = planSmokeCalls(catalog(), { coin: () => true });
    expect(planned).toHaveLength(SMOKE_CALL_CAP);
    expect(planned.filter((call) => call.policy.model === CONTROL_MODEL)).toHaveLength(6);
    expect(planned.filter((call) => call.policy.model === CANDIDATE_MODEL)).toHaveLength(6);
    expect(planned.every((call) => call.policy.quality === "medium")).toBe(true);
    expect(planned.every((call) => call.operation === "edit")).toBe(true);
    expect(planned.every((call) => call.sourcePaths.length >= 1)).toBe(true);
  });

  it("puts revision invariants in review prompts", () => {
    const prompt = buildCasePrompt(catalog().cases[5]);
    expect(prompt).toContain("AUTHORIZED CHANGE: Troque somente a chamada visível para JUST DO IT.");
    expect(prompt).toContain("PRESERVE UNLESS EXPLICITLY CHANGED:");
  });

  it("treats missing usage as unknown, never zero", () => {
    expect(estimateStandardUsd(null)).toEqual({ usd: null, basis: "unknown" });
    expect(estimateStandardUsd({})).toEqual({ usd: null, basis: "unknown" });
    const detailed = estimateStandardUsd({
      input_tokens: 1000,
      output_tokens: 2000,
      input_tokens_details: { text_tokens: 200, image_tokens: 800 },
    });
    expect(detailed.basis).toBe("detailed");
    expect(detailed.usd).toBeCloseTo((200 * 5 + 800 * 8 + 2000 * 30) / 1_000_000);
  });

  it("stops on unknown usage and at the usd/call caps", () => {
    expect(shouldStopBatch({ callsCompleted: 1, callCap: 12, usdSpent: 0.2, usdCap: 10, lastUsageUnknown: true })).toEqual({
      stop: true,
      reason: "usage_unknown",
    });
    expect(shouldStopBatch({ callsCompleted: 3, callCap: 12, usdSpent: 10, usdCap: 10, lastUsageUnknown: false }).reason).toBe("usd_cap");
    expect(shouldStopBatch({ callsCompleted: 12, callCap: 12, usdSpent: 1, usdCap: 10, lastUsageUnknown: false }).reason).toBe("call_cap");
  });

  it("dry-run writes a plan and never calls generate", async () => {
    const generate = vi.fn();
    const outDir = mkdtempSync(join(tmpdir(), "sunburst-smoke-out-"));
    const result = await runSmokeBatch({
      catalog: catalog(),
      binariesRoot: binariesRoot(),
      outDir,
      confirmPaid: false,
      dryRun: true,
      generate,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(result.status).toBe("dry_run");
    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
    expect(manifest.planned).toHaveLength(12);
    expect(manifest.calls).toEqual([]);
  });

  it("refuses paid calls without confirm", async () => {
    await expect(runSmokeBatch({
      catalog: catalog(),
      binariesRoot: binariesRoot(),
      outDir: mkdtempSync(join(tmpdir(), "sunburst-smoke-out-")),
      confirmPaid: false,
      dryRun: false,
      generate: vi.fn(),
    })).rejects.toThrow(/confirm-paid/);
  });

  it("stops after unknown usage and does not continue the batch", async () => {
    const generate = vi.fn().mockResolvedValue({
      buffer: Buffer.from("png"),
      mimeType: "image/png",
      providerMeta: { model: CONTROL_MODEL, durationMs: 10, observation: { usage: null } },
    });
    const result = await runSmokeBatch({
      catalog: catalog(),
      binariesRoot: binariesRoot(),
      outDir: mkdtempSync(join(tmpdir(), "sunburst-smoke-out-")),
      confirmPaid: true,
      dryRun: false,
      generate,
      coin: () => true,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(result.stopReason).toBe("usage_unknown");
    expect(result.usdSpent).toBeNull();
  });

  it("records a provider error as unknown billing and stops", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("model_not_found"));
    const result = await runSmokeBatch({
      catalog: catalog(),
      binariesRoot: binariesRoot(),
      outDir: mkdtempSync(join(tmpdir(), "sunburst-smoke-out-")),
      confirmPaid: true,
      dryRun: false,
      generate,
      coin: () => true,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(result.stopReason).toBe("provider_error");
    expect(result.usdSpent).toBeNull();
    expect(result.calls[0]).toMatchObject({ billing: "unknown", usage: null });
  });
});

describe("sunburst follow-up planners", () => {
  it("plans remaining ready edits plus generate-without-refs, and skips carousel", () => {
    const planned = planPrincipalCalls(catalog(), { coin: () => true });
    expect(planned.filter((call) => call.operation === "edit")).toHaveLength(2);
    expect(planned.filter((call) => call.operation === "generate")).toHaveLength(4);
    expect(planned.filter((call) => call.operation === "generate").every((call) => call.sourcePaths.length === 0)).toBe(true);
    expect(planned.some((call) => call.caseId.startsWith("carousel-"))).toBe(false);
    expect(planned.every((call) => call.policy.quality === "medium")).toBe(true);
  });

  it("plans 18 sequence calls and 24 calibration calls on the frozen corpus", () => {
    const frozen = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as Catalog;
    const principal = planPrincipalCalls(frozen, { coin: () => true });
    const sequences = planSequenceCalls(frozen, { coin: () => true });
    const calibration = planCalibrationCalls(frozen, { coin: () => true });
    expect(principal).toHaveLength(32);
    expect(principal.filter((call) => call.operation === "edit")).toHaveLength(28);
    expect(principal.filter((call) => call.operation === "generate")).toHaveLength(4);
    expect(sequences).toHaveLength(18);
    expect(calibration).toHaveLength(24);
    expect(planNamedBatch("principal", frozen)).toHaveLength(32);
    expect(planNamedBatch("sequences", frozen)).toHaveLength(18);
    expect(planNamedBatch("calibration", frozen)).toHaveLength(24);
  });

  it("keeps Image 2 calibration at high and never sends xhigh/max", () => {
    const planned = planCalibrationCalls(catalog(), { coin: () => true });
    expect(planned).toHaveLength(24);
    expect(
      planned.filter((call) => call.policy.model === CONTROL_MODEL).every((call) => call.policy.quality === "high"),
    ).toBe(true);
    expect(planned.some((call) => call.policy.model === CONTROL_MODEL && call.policy.quality === "xhigh")).toBe(false);
    expect(planned.some((call) => call.policy.model === CONTROL_MODEL && call.policy.quality === "max")).toBe(false);
    expect(
      planned
        .filter((call) => call.policy.model === CANDIDATE_MODEL)
        .map((call) => call.policy.quality)
        .sort(),
    ).toEqual(["high", "high", "high", "high", "high", "high", "max", "max", "max", "max", "max", "max", "xhigh", "xhigh", "xhigh", "xhigh", "xhigh", "xhigh"]);
  });

  it("replaces the first sequence reference with the previous slide output", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({
        buffer: Buffer.from("slide-1"),
        mimeType: "image/png",
        providerMeta: { model: CONTROL_MODEL, durationMs: 4, observation: { usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { text_tokens: 1, image_tokens: 9 } } } },
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from("slide-2"),
        mimeType: "image/png",
        providerMeta: { model: CONTROL_MODEL, durationMs: 4, observation: { usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { text_tokens: 1, image_tokens: 9 } } } },
      });
    const planned = planSequenceCalls(catalog(), { coin: () => true }).filter(
      (call) => call.callKey?.startsWith("sequence-nike-control-"),
    );
    const result = await executePlannedCalls({
      batch: "sequences",
      planned: planned.slice(0, 2),
      binariesRoot: binariesRoot(),
      outDir: mkdtempSync(join(tmpdir(), "sunburst-seq-")),
      confirmPaid: true,
      dryRun: false,
      callCap: 2,
      usdCap: FOLLOWUP_USD_CAP,
      generate,
    });
    expect(result.calls).toHaveLength(2);
    const firstRefs = generate.mock.calls[0]?.[0]?.referenceImages as Array<{ buffer: Buffer; name: string }>;
    const secondRefs = generate.mock.calls[1]?.[0]?.referenceImages as Array<{ buffer: Buffer; name: string }>;
    expect(firstRefs).toHaveLength(1);
    expect(firstRefs[0]?.buffer.equals(Buffer.from("nike-out"))).toBe(true);
    expect(secondRefs).toHaveLength(1);
    expect(secondRefs[0]?.buffer.equals(Buffer.from("slide-1"))).toBe(true);
    expect(secondRefs[0]?.name).toBe("previous.png");
  });

  it("does not send references on generate calls", async () => {
    const generate = okGenerate();
    const planned = planPrincipalCalls(catalog(), { coin: () => true }).filter((call) => call.operation === "generate").slice(0, 1);
    await executePlannedCalls({
      batch: "principal",
      planned,
      binariesRoot: binariesRoot(),
      outDir: mkdtempSync(join(tmpdir(), "sunburst-gen-")),
      confirmPaid: true,
      dryRun: false,
      callCap: 1,
      usdCap: FOLLOWUP_USD_CAP,
      generate,
    });
    expect(generate.mock.calls[0]?.[0]?.referenceImages).toEqual([]);
  });

  it("treats missing previous spend as zero and unknown spend as blocking", () => {
    const root = mkdtempSync(join(tmpdir(), "sunburst-spend-"));
    expect(readAccumulatedUsd(root, ["principal", "sequences"])).toEqual({ usd: 0, unknown: false });
    mkdirSync(join(root, "principal"), { recursive: true });
    writeFileSync(join(root, "principal/status.json"), `${JSON.stringify({ usdSpent: 1.25 })}\n`);
    expect(readAccumulatedUsd(root, ["principal", "sequences"])).toEqual({ usd: 1.25, unknown: false });
    mkdirSync(join(root, "sequences"), { recursive: true });
    writeFileSync(join(root, "sequences/status.json"), `${JSON.stringify({ usdSpent: null })}\n`);
    expect(readAccumulatedUsd(root, ["principal", "sequences"]).unknown).toBe(true);
    writeFileSync(join(root, "sequences/status.json"), `${JSON.stringify({ status: "dry_run", usdSpent: null })}\n`);
    expect(readAccumulatedUsd(root, ["principal", "sequences"])).toEqual({ usd: 1.25, unknown: false });
  });
});
