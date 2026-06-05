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
  buildHardFailureRegenerationSuggestion,
} from "@/server/ai/creative-score";
import type { CreativeContract } from "@/server/ai/creative-contract";

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

describe("buildHardFailureRegenerationSuggestion", () => {
  const restylingContract: CreativeContract = {
    generationMode: "restyling",
    targetFormat: "9:16",
    ctaSemantics: { kind: "inherited" },
    baseAssetId: "base-asset-1",
    styleAssetId: "style-asset-2",
    client: null,
    product: null,
    offer: null,
    constraints: null,
  };

  it("lists both hard failure codes and fix messages", () => {
    const suggestion = buildHardFailureRegenerationSuggestion({
      hardFailures: [
        { code: "cta_drift", message: "CTA was replaced." },
        { code: "wrong_brand", message: "Brand logo does not match Acme." },
      ],
      contract: {
        generationMode: "art_variation",
        targetFormat: "4:5",
        ctaSemantics: { kind: "explicit", text: "Shop Now" },
        baseAssetId: null,
        styleAssetId: null,
        client: "Acme",
        product: null,
        offer: null,
        constraints: null,
      },
    });

    expect(suggestion).toContain("Hard failures:");
    expect(suggestion).toContain("cta_drift: CTA was replaced.");
    expect(suggestion).toContain("wrong_brand: Brand logo does not match Acme.");
    expect(suggestion).toContain("Shop Now");
    expect(suggestion).toContain("4:5");
    expect(suggestion).toContain("art_variation");
  });

  it("includes restyling base and style asset IDs in the preservation tail", () => {
    const suggestion = buildHardFailureRegenerationSuggestion({
      hardFailures: [
        {
          code: "copied_style_reference_facts",
          message: "Output copied discount from style reference.",
        },
      ],
      contract: restylingContract,
    });

    expect(suggestion).toContain("base-asset-1");
    expect(suggestion).toContain("style-asset-2");
    expect(suggestion).toContain("copied_style_reference_facts");
  });

  it("delegates to buildRegenerationSuggestion when there are no hard failures", () => {
    const suggestion = buildHardFailureRegenerationSuggestion({
      hardFailures: [],
      contract: {
        generationMode: "art_variation",
        targetFormat: "1:1",
        ctaSemantics: { kind: "explicit", text: "Buy now" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
      scoreIssues: ["Low contrast"],
      modelSuggestion: "Increase contrast.",
    });

    expect(suggestion).not.toContain("Hard failures:");
    expect(suggestion).toContain("Low contrast");
    expect(suggestion).toContain("Increase contrast.");
    expect(suggestion).toContain("Buy now");
  });

  it("uses inherited CTA preservation for format_adaptation (not literal none)", () => {
    const suggestion = buildHardFailureRegenerationSuggestion({
      hardFailures: [
        {
          code: "invalid_format_layout",
          message: "Layout uses blur bands instead of native reflow.",
        },
      ],
      contract: {
        generationMode: "format_adaptation",
        targetFormat: "9:16",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });

    expect(suggestion).not.toContain('"none"');
    expect(suggestion).toContain("base creative");
    expect(suggestion).toContain("format_adaptation");
    expect(suggestion).toContain("9:16");
  });
});
