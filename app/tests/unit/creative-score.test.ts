import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-4o",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
  },
}));

import {
  scoreDerivationHeuristic,
  buildRegenerationSuggestion,
} from "@/server/ai/creative-score";

describe("scoreDerivationHeuristic", () => {
  it("includes variationLevelFit in breakdown", () => {
    const result = scoreDerivationHeuristic({
      status: "completed",
      format: "1:1",
      generationMode: "art_variation",
      ctaText: "Buy now",
      parentId: null,
    });
    expect(result.scoreBreakdown).toHaveProperty("variationLevelFit");
    expect(result.scoreBreakdown).toHaveProperty("informationPreservation");
    expect(typeof result.scoreBreakdown.variationLevelFit).toBe("number");
    expect(typeof result.scoreBreakdown.informationPreservation).toBe("number");
  });

  it("returns scores within 0–100", () => {
    const result = scoreDerivationHeuristic({
      status: "completed",
      format: null,
      generationMode: null,
      ctaText: null,
      parentId: null,
    });
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(100);
    expect(result.scoreBreakdown.ctaClarity).toBeGreaterThanOrEqual(0);
    expect(result.scoreBreakdown.ctaClarity).toBeLessThanOrEqual(100);
    expect(result.scoreBreakdown.variationLevelFit).toBeGreaterThanOrEqual(0);
    expect(result.scoreBreakdown.variationLevelFit).toBeLessThanOrEqual(100);
    expect(result.scoreBreakdown.informationPreservation).toBeGreaterThanOrEqual(0);
    expect(result.scoreBreakdown.informationPreservation).toBeLessThanOrEqual(100);
  });
});

describe("buildRegenerationSuggestion", () => {
  it("preserves CTA, format, and generation mode", () => {
    const suggestion = buildRegenerationSuggestion({
      ctaText: "Shop Now",
      format: "9:16",
      generationMode: "art_variation",
      scoreIssues: ["CTA too small"],
      modelSuggestion: "Make CTA larger",
    });
    expect(suggestion).toContain("Shop Now");
    expect(suggestion).toContain("9:16");
    expect(suggestion).toContain("art_variation");
    expect(suggestion).toContain("CTA too small");
    expect(suggestion).toContain("Make CTA larger");
  });

  it("uses inherited CTA semantics when contract is provided", () => {
    const suggestion = buildRegenerationSuggestion({
      ctaText: null,
      format: "9:16",
      generationMode: "restyling",
      scoreIssues: [],
      modelSuggestion: "Refine layout",
      contract: {
        generationMode: "restyling",
        targetFormat: "9:16",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: "base-1",
        styleAssetId: "style-2",
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(suggestion).not.toContain('"none"');
    expect(suggestion).toContain("base creative");
    expect(suggestion).toContain("style-2");
    expect(suggestion).toContain("base-1");
  });
});
