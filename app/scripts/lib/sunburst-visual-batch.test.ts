import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  CANDIDATE_MODEL,
  CONTROL_MODEL,
  SMOKE_CALL_CAP,
  buildCasePrompt,
  estimateStandardUsd,
  planSmokeCalls,
  runSmokeBatch,
  shouldStopBatch,
} from "./sunburst-visual-batch";

function catalog() {
  const assets = [
    { id: "nike", path: "docs/originals/nike.jpg", sha256: "n" },
    { id: "mtv", path: "docs/originals/mtv.jpg", sha256: "m" },
    { id: "absolut", path: "docs/originals/absolut.jpg", sha256: "a" },
  ];
  const cases = [
    smokeCase("piece-nike-just-do-it-4x5", "piece", "nike"),
    smokeCase("piece-mtv-network-id-4x5", "piece", "mtv"),
    smokeCase("piece-absolut-perfection-4x5", "piece", "absolut"),
    smokeCase("variation-mtv-skin-change", "variation", "mtv"),
    smokeCase("restyle-absolut-keep-bottle", "restyle", "absolut"),
    smokeCase("review-nike-copy-only", "review", "nike"),
  ];
  return {
    sunburstPercent: 0,
    assets,
    cases,
    batches: { smokeCaseIds: cases.map((entry) => entry.id) },
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
  writeFileSync(join(root, "docs/originals/nike.jpg"), "nike");
  writeFileSync(join(root, "docs/originals/mtv.jpg"), "mtv");
  writeFileSync(join(root, "docs/originals/absolut.jpg"), "absolut");
  return root;
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
});
