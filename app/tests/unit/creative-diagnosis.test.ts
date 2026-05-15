import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-4o",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
  },
}));

import {
  normalizeCreativeDiagnosis,
  buildCreativeDiagnosisPrompt,
} from "@/server/ai/creative-diagnosis";

describe("normalizeCreativeDiagnosis", () => {
  it("accepts valid structured JSON", () => {
    const raw = {
      detectedConcept: "A direct-response promotion for skincare.",
      elementsToPreserve: ["product packshot", "20% off offer", "primary CTA"],
      variationOpportunities: ["make offer hierarchy more prominent"],
    };
    const result = normalizeCreativeDiagnosis(raw);
    expect(result).not.toBeNull();
    expect(result?.detectedConcept).toBe("A direct-response promotion for skincare.");
    expect(result?.elementsToPreserve).toHaveLength(3);
    expect(result?.variationOpportunities).toHaveLength(1);
  });

  it("rejects or normalizes malformed output", () => {
    expect(normalizeCreativeDiagnosis(null)).toBeNull();
    expect(normalizeCreativeDiagnosis({})).toBeNull();
    expect(normalizeCreativeDiagnosis({ detectedConcept: "" })).toBeNull();
    expect(
      normalizeCreativeDiagnosis({
        detectedConcept: "Valid concept",
        elementsToPreserve: ["item"],
      })
    ).not.toBeNull();
  });

  it("filters empty strings from arrays", () => {
    const raw = {
      detectedConcept: "Concept",
      elementsToPreserve: ["item", "", "  ", "other"],
      variationOpportunities: ["", "opp", ""],
    };
    const result = normalizeCreativeDiagnosis(raw);
    expect(result?.elementsToPreserve).toEqual(["item", "other"]);
    expect(result?.variationOpportunities).toEqual(["opp"]);
  });
});

describe("buildCreativeDiagnosisPrompt", () => {
  it("includes campaign context", () => {
    const prompt = buildCreativeDiagnosisPrompt({
      name: "Summer Sale",
      client: "Acme",
      product: "Shoes",
      objective: "Conversion",
      audience: "Women 25-34",
      platforms: ["Meta"],
      tone: "Bold",
      offer: "50% off",
      constraints: "No red backgrounds",
      notes: "Focus on summer vibes",
      ctaVariants: ["Shop Now", "Buy Today"],
    });
    expect(prompt).toContain("Summer Sale");
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("Conversion");
    expect(prompt).toContain("Women 25-34");
    expect(prompt).toContain("50% off");
    expect(prompt).toContain("No red backgrounds");
    expect(prompt).toContain("Shop Now");
    expect(prompt).toContain('"detectedConcept"');
    expect(prompt).toContain('"elementsToPreserve"');
    expect(prompt).toContain('"variationOpportunities"');
  });

  it("uses pt-BR language when locale is pt-BR", () => {
    const prompt = buildCreativeDiagnosisPrompt(
      { name: "Test", client: null, product: null, objective: null, audience: null, platforms: null, tone: null, offer: null, constraints: null, notes: null, ctaVariants: null },
      "pt-BR"
    );
    expect(prompt).toContain("português brasileiro");
  });
});
