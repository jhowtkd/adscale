import { describe, it, expect } from "vitest";
import {
  createSyntheticHookIllegibleImage,
  createSyntheticHookLegibleImage,
  downscaleToPreview,
  evaluateThumbnailHookLegibility,
  getPreviewDimensions,
  measureHookLegibilityAtPreview,
} from "@/server/ai/thumbnail-hook-legibility";

describe("TEST-04 thumbnail hook legibility", () => {
  it("downscales 1:1 creative to preview dimensions (270×270)", async () => {
    const full = await createSyntheticHookLegibleImage(1080, 1080);
    const preview = await downscaleToPreview(full, "1:1");
    const meta = await import("sharp").then((m) => m.default(preview).metadata());

    const dims = getPreviewDimensions("1:1");
    expect(meta.width).toBe(dims.width);
    expect(meta.height).toBe(dims.height);
    expect(dims.width).toBe(270);
    expect(dims.height).toBe(270);
  });

  it("passes legibility heuristic for high-contrast hook band at preview scale", async () => {
    const full = await createSyntheticHookLegibleImage(1080, 1080);
    const result = await evaluateThumbnailHookLegibility(full, "1:1");

    expect(result.legible).toBe(true);
    expect(result.metrics.contrastDelta).toBeGreaterThan(0.12);
    expect(result.metrics.hookZoneStdDev).toBeGreaterThan(0.06);
  });

  it("fails legibility heuristic for uniform low-contrast hook at preview scale", async () => {
    const full = await createSyntheticHookIllegibleImage(1080, 1080);
    const metrics = await measureHookLegibilityAtPreview(full, "1:1");
    const result = await evaluateThumbnailHookLegibility(full, "1:1");

    expect(result.legible).toBe(false);
    expect(metrics.contrastDelta).toBeLessThan(0.05);
  });

  it("evaluates 9:16 preview dimensions for vertical formats", async () => {
    const dims = getPreviewDimensions("9:16");
    expect(dims.width).toBe(270);
    expect(dims.height).toBe(480);

    const full = await createSyntheticHookLegibleImage(1080, 1920);
    const preview = await downscaleToPreview(full, "9:16");
    const meta = await import("sharp").then((m) => m.default(preview).metadata());
    expect(meta.width).toBe(270);
    expect(meta.height).toBe(480);
  });
});
