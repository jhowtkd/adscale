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

  it("preserves direction-first fields when present", () => {
    const result = normalizeCreativeScoreResult({
      qualityScore: 72,
      olharVerdict: "quase",
      whatWorks: ["Strong focal figure"],
      whatBlocks: ["Invite competes with headline"],
      directionNote: "Simplify the lower third before export.",
      scoreBreakdown: { visualQuality: 70 },
    });

    expect(result.olharVerdict).toBe("quase");
    expect(result.whatWorks).toEqual(["Strong focal figure"]);
    expect(result.whatBlocks).toEqual(["Invite competes with headline"]);
    expect(result.directionNote).toBe(
      "Simplify the lower third before export."
    );
    expect(result.qualityScore).toBe(72);
  });

  it("accepts legacy score-only responses without direction fields", () => {
    const result = normalizeCreativeScoreResult({
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
    });

    expect(result.scoreStatus).toBe("analyzed");
    expect(result.qualityScore).toBe(84);
    expect(result.olharVerdict).toBeNull();
    expect(result.directionNote).toBeNull();
    expect(result.whatWorks).toEqual([]);
    expect(result.whatBlocks).toEqual([]);
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

  it("includes advisory art-direction guidance", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/ART DIRECTION \(ranking guidance\)/);
    expect(prompt).toMatch(/optional techniques, not validity rules/i);
  });

  it("includes observable defect note rule (RUBR-03)", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/OBSERVABLE DEFECT|visible elements/i);
  });

  it("rubric parity with QA without score caps", () => {
    const qaPrompt = buildCreativeQaPrompt({
      locale: baseInput.locale,
      campaign: baseInput.campaign,
      derivation: baseInput.derivation,
      contract: baseInput.contract,
    });
    const scorePrompt = buildCreativeScorePrompt(baseInput);
    const coreRubricMarkers = [
      "OBSERVABLE DEFECT NOTES",
      "ART DIRECTION (ranking guidance)",
      "Dominant idea reference",
    ];

    for (const marker of coreRubricMarkers) {
      expect(extractObservableRubricSection(scorePrompt)).toContain(marker);
      expect(extractObservableRubricSection(qaPrompt)).toContain(marker);
    }

    expect(scorePrompt).not.toMatch(/SCORE VISUAL QUALITY CAPS/);
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

describe("score dimension map (SCR-01)", () => {
  const baseInput = {
    imageBuffer: Buffer.from("fake"),
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
      generationMode: "art_variation" as const,
      feedback: null,
    },
    contract: {
      generationMode: "art_variation" as const,
      targetFormat: "4:5",
      ctaSemantics: { kind: "explicit" as const, text: "Shop Now" },
      baseAssetId: null,
      styleAssetId: null,
      client: "Acme",
      product: "Widget",
      offer: "20% off",
      constraints: null,
    },
  };

  it("dimension map lists all six SCR-01 concern buckets", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/SCORE DIMENSION MAP/i);
    expect(prompt).toContain("Factual integrity");
    expect(prompt).toContain("Hierarchy");
    expect(prompt).toContain("Legibility");
    expect(prompt).toContain("Art direction");
    expect(prompt).toContain("Originality");
    expect(prompt).toContain("Format fit");
  });

  it("dimension map references breakdown keys per SCR-01 mapping", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/briefMatch.*informationPreservation|informationPreservation.*briefMatch/);
    expect(prompt).toContain("visualQuality");
    expect(prompt).toContain("textLegibility");
    expect(prompt).toContain("variationLevelFit");
    expect(prompt).toContain("formatFit");
    expect(prompt).toMatch(/server-side.*ceilings|SCR-02/i);
  });

  it("treats numeric qualityScore as secondary/internal analytics", () => {
    const prompt = buildCreativeScorePrompt(baseInput);
    expect(prompt).toMatch(/PRIMARY OUTPUT/i);
    expect(prompt).toMatch(/SECONDARY.*INTERNAL ANALYTICS/i);
    expect(prompt).toMatch(/qualityScore.*secondary|secondary.*qualityScore/i);
    expect(prompt).toMatch(/olharVerdict|directionNote|whatWorks|whatBlocks/i);
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
    expect(result.regenerationSuggestion).toContain("action intent");
  });

  it("builds corrective feedback that preserves CTA and format", () => {
    const suggestion = buildRegenerationSuggestion({
      ctaText: "Compre agora",
      format: "4:5",
      generationMode: "format_adaptation",
      scoreIssues: ["Text is hard to read"],
      modelSuggestion: "Increase text contrast.",
    });

    expect(suggestion).toContain("action intent");
    expect(suggestion).toContain("4:5");
    expect(suggestion).toContain("format_adaptation");
  });
});
