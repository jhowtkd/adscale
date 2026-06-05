import { describe, it, expect } from "vitest";
import { buildCreativeReadiness } from "./creative-readiness";
import type { PreflightResult } from "./preflight-analysis";

function makePreflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  const baseDimension = { score: 80, suggestion: "Looks good." };
  return {
    overallScore: 80,
    breakdown: {
      technicalQuality: baseDimension,
      textLegibility: baseDimension,
      visualHierarchy: baseDimension,
      ctaProminence: baseDimension,
      composition: baseDimension,
      brandConsistency: baseDimension,
      platformReadiness: baseDimension,
    },
    criticalIssues: [],
    suggestions: [],
    technical: {
      actualWidth: 1080,
      actualHeight: 1080,
      claimedWidth: 1080,
      claimedHeight: 1080,
      aspectRatio: "1:1",
      format: "png",
      fileSizeBytes: 1024,
      hasAlpha: false,
      estimatedContrast: 0.7,
    },
    ...overrides,
  };
}

const baseInput = {
  campaignId: "camp-1",
  assetId: "asset-1",
  analyzedAt: "2026-06-05T12:00:00.000Z",
  campaignBrief: {
    product: "Running shoes",
    offer: "20% off",
  },
};

describe("buildCreativeReadiness", () => {
  it("maps a strong preflight result to ready status", () => {
    const result = buildCreativeReadiness({
      preflight: makePreflight(),
      ...baseInput,
    });

    expect(result.status).toBe("ready");
    expect(result.canGenerate).toBe(true);
    expect(result.dimensions).toHaveLength(6);
    expect(result.dimensions.map((d) => d.id)).toEqual([
      "offerClarity",
      "textLegibility",
      "visualHierarchy",
      "ctaProminence",
      "brandFit",
      "platformFit",
    ]);
    expect(result.blockingIssues).toHaveLength(0);
  });

  it("marks needs_attention when overall score is between 50 and 69", () => {
    const preflight = makePreflight({
      overallScore: 62,
      breakdown: {
        ...makePreflight().breakdown,
        textLegibility: { score: 62, suggestion: "Increase text contrast slightly." },
      },
      suggestions: ["Increase text contrast slightly."],
    });

    const result = buildCreativeReadiness({
      preflight,
      ...baseInput,
    });

    expect(result.status).toBe("needs_attention");
    expect(result.canGenerate).toBe(true);
    expect(result.suggestions).toContain("Increase text contrast slightly.");
  });

  it("blocks when overall score is under 50", () => {
    const preflight = makePreflight({
      overallScore: 42,
      breakdown: {
        ...makePreflight().breakdown,
        textLegibility: { score: 35, suggestion: "Text is unreadable at mobile size." },
      },
    });

    const result = buildCreativeReadiness({
      preflight,
      ...baseInput,
    });

    expect(result.status).toBe("blocked");
    expect(result.canGenerate).toBe(false);
    expect(result.blockingIssues).toContain("Text is unreadable at mobile size.");
  });

  it("blocks on critical issues even when score is high", () => {
    const preflight = makePreflight({
      overallScore: 85,
      criticalIssues: ["CTA is completely missing from the creative."],
    });

    const result = buildCreativeReadiness({
      preflight,
      ...baseInput,
    });

    expect(result.status).toBe("blocked");
    expect(result.canGenerate).toBe(false);
    expect(result.blockingIssues).toContain("CTA is completely missing from the creative.");
  });

  it("blocks when campaign brief is missing product and offer", () => {
    const preflight = makePreflight({
      breakdown: {
        ...makePreflight().breakdown,
        visualHierarchy: { score: 75, suggestion: "Hierarchy is acceptable." },
      },
    });

    const result = buildCreativeReadiness({
      preflight,
      campaignId: "camp-1",
      assetId: "asset-1",
      campaignBrief: {},
    });

    expect(result.status).toBe("blocked");
    expect(result.canGenerate).toBe(false);
    expect(result.blockingIssues).toContain(
      "Campaign brief is missing product or offer context required for generation."
    );
    expect(result.dimensions.find((d) => d.id === "offerClarity")?.score).toBeLessThanOrEqual(40);
  });

  it("includes source metadata for reruns", () => {
    const result = buildCreativeReadiness({
      preflight: makePreflight(),
      ...baseInput,
      preflightStatus: "completed",
    });

    expect(result.source).toEqual({
      campaignId: "camp-1",
      assetId: "asset-1",
      analyzedAt: "2026-06-05T12:00:00.000Z",
      preflightStatus: "completed",
    });
  });
});
