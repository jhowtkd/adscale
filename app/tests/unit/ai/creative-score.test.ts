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

import {
  analyzeDerivationCreative,
  buildRegenerationSuggestion,
  scoreDerivationHeuristic,
} from "@/server/ai/creative-score";

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
