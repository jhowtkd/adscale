import { describe, it, expect, vi } from "vitest";

const mockResponsesCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    output_text: JSON.stringify({
      qualityScore: 84,
      scoreBreakdown: {
        ctaClarity: 88,
        textLegibility: 80,
        briefMatch: 86,
        visualQuality: 82,
        formatFit: 84,
        variationLevelFit: 83,
        informationPreservation: 52,
      },
      scoreIssues: ["CTA contrast could be stronger"],
      regenerationSuggestion: "Increase CTA contrast while preserving the exact CTA text.",
    }),
  })
);

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({
    responses: { create: mockResponsesCreate },
  }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-5-mini",
  },
}));

import { buildCreativeQaPrompt } from "@/server/ai/creative-qa";
import { extractObservableRubricSection } from "@/server/ai/observable-rubric";
import {
  analyzeDerivationCreative,
  buildCreativeScorePrompt,
  buildRegenerationSuggestion,
  normalizeCreativeScoreResult,
  scoreDerivationHeuristic,
} from "@/server/ai/creative-score";

describe("normalizeCreativeScoreResult", () => {
  it("returns failed status for empty object", () => {
    const result = normalizeCreativeScoreResult({});
    expect(result.scoreStatus).toBe("failed");
    expect(result.qualityScore).toBe(0);
    expect(result.scoreIssues).toEqual([]);
    expect(result.scoreBreakdown.ctaClarity).toBe(0);
  });

  it("returns failed status for malformed qualityScore with no valid breakdown", () => {
    const result = normalizeCreativeScoreResult({
      qualityScore: "not-a-number",
      scoreBreakdown: {},
    });
    expect(result.scoreStatus).toBe("failed");
    expect(result.qualityScore).toBe(0);
  });

  it("uses 0 for missing breakdown dimensions, not 70", () => {
    const result = normalizeCreativeScoreResult({
      qualityScore: 80,
      scoreBreakdown: {
        ctaClarity: 90,
      },
    });
    expect(result.scoreStatus).toBe("analyzed");
    expect(result.qualityScore).toBe(80);
    expect(result.scoreBreakdown.textLegibility).toBe(0);
    expect(result.scoreBreakdown.ctaClarity).toBe(90);
  });

  it("averages valid dimensions when qualityScore is missing", () => {
    const result = normalizeCreativeScoreResult({
      scoreBreakdown: {
        ctaClarity: 80,
        textLegibility: 60,
      },
    });
    expect(result.scoreStatus).toBe("analyzed");
    expect(result.qualityScore).toBe(70);
  });

  it("caps scoreIssues at 3 strings", () => {
    const result = normalizeCreativeScoreResult({
      qualityScore: 50,
      scoreIssues: ["a", "b", "c", "d"],
    });
    expect(result.scoreIssues).toHaveLength(3);
  });

  it("returns failed for non-object input", () => {
    const result = normalizeCreativeScoreResult(null);
    expect(result.scoreStatus).toBe("failed");
    expect(result.qualityScore).toBe(0);
  });
});

describe("buildCreativeScorePrompt observable rubric", () => {
  const baseInput = {
    imageBuffer: Buffer.from("fake"),
    mimeType: "image/png",
    locale: "pt-BR",
    campaign: {
      name: "NR1 Launch",
      client: "Acme",
      product: "Serum",
      offer: "20% off",
      objective: "Conversions",
      audience: "New buyers",
    },
    derivation: {
      ctaText: "Shop now",
      format: "1:1",
      generationMode: "art_variation" as const,
      feedback: null,
      creativeLevel: "balanced",
    },
    contract: {
      generationMode: "art_variation" as const,
      targetFormat: "1:1",
      ctaSemantics: { kind: "explicit" as const, text: "Shop now" },
      baseAssetId: "base-1",
      styleAssetId: null,
      client: "Acme",
      product: "Serum",
      offer: "20% off",
      constraints: null,
      canonicalCreative: {
        dominantIdea: "NR1 card grid hero",
      },
    },
  };

  it("includes visual overload scoring guidance (RUBR-01)", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/visual overload|visualQuality.*below 50|dominant focal/i);
  });

  it("includes generic template rubric (RUBR-02)", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/GENERIC TEMPLATE|generic template/i);
  });

  it("includes observable defect note rule (RUBR-03)", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/OBSERVABLE DEFECT|visible elements/i);
  });

  it("includes thumbnail preview scale (RUBR-04)", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/THUMBNAIL|PREVIEW SCALE|270/i);
  });

  it("rubric parity with QA", () => {
    const qaPrompt = buildCreativeQaPrompt({
      locale: baseInput.locale,
      campaign: baseInput.campaign,
      derivation: baseInput.derivation,
      contract: baseInput.contract,
    });
    const scorePrompt = buildCreativeScorePrompt(baseInput);
    expect(extractObservableRubricSection(scorePrompt)).toEqual(
      extractObservableRubricSection(qaPrompt)
    );
  });

  it("includes allowedEntities briefMatch block for registry campaigns", () => {
    const prompt = buildCreativeScorePrompt({
      ...baseInput,
      campaign: {
        ...baseInput.campaign,
        name: "Teste 3",
        client: "CENBRAP",
      },
    });
    expect(prompt).toMatch(/allowed entity registry/i);
    expect(prompt).toMatch(/CENBRAP/);
  });
});

describe("creative scoring", () => {
  it("creates a heuristic score without visual analysis", () => {
    const result = scoreDerivationHeuristic({
      status: "completed",
      format: "1:1",
      generationMode: "art_variation",
      ctaText: "Compre agora",
      parentId: null,
    });

    expect(result.scoreStatus).toBe("heuristic");
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(100);
    expect(result.scoreBreakdown).toHaveProperty("ctaClarity");
  });

  it("vision prompt requires contract violations in scoreIssues", async () => {
    mockResponsesCreate.mockClear();

    await analyzeDerivationCreative({
      imageBuffer: Buffer.from("fake-image"),
      mimeType: "image/png",
      locale: "en",
      campaign: {
        name: "Summer",
        client: "Acme",
        product: "Widget",
        offer: "20% off",
        objective: "Sales",
        audience: "Parents",
      },
      derivation: {
        ctaText: "Shop Now",
        format: "4:5",
        generationMode: "art_variation",
        feedback: null,
      },
      contract: {
        generationMode: "art_variation",
        targetFormat: "4:5",
        ctaSemantics: { kind: "explicit", text: "Shop Now" },
        baseAssetId: null,
        styleAssetId: null,
        client: "Acme",
        product: "Widget",
        offer: "20% off",
        constraints: null,
      },
    });

    const promptText = mockResponsesCreate.mock.calls[0]?.[0]?.input?.[1]?.content?.[0]
      ?.text as string;
    expect(promptText).toMatch(/scoreIssues/i);
    expect(promptText).toMatch(/contract violations|CONTRACT VIOLATIONS/i);
    expect(promptText).toMatch(/visualQuality/i);
  });

  it("analyzes a generated creative from a vision response", async () => {
    const result = await analyzeDerivationCreative({
      imageBuffer: Buffer.from("fake-image"),
      mimeType: "image/png",
      campaign: {
        name: "Summer campaign",
        client: "Client",
        product: "Product",
        offer: "50% off",
        objective: "Sales",
        audience: "Busy parents",
      },
      derivation: {
        ctaText: "Compre agora",
        format: "1:1",
        generationMode: "art_variation",
        feedback: null,
      },
      locale: "pt-BR",
    });

    expect(result.scoreStatus).toBe("analyzed");
    expect(result.qualityScore).toBe(84);
    expect(result.scoreBreakdown.informationPreservation).toBe(52);
    expect(result.regenerationSuggestion).toContain("preserving the exact CTA text");
  });

  it("builds corrective feedback that preserves CTA and format", () => {
    const suggestion = buildRegenerationSuggestion({
      ctaText: "Compre agora",
      format: "4:5",
      generationMode: "format_adaptation",
      scoreIssues: ["Text is hard to read"],
      modelSuggestion: "Increase text contrast.",
    });

    expect(suggestion).toContain("Compre agora");
    expect(suggestion).toContain("4:5");
    expect(suggestion).toContain("format_adaptation");
  });
});
