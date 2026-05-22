import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-4o",
  },
}));

import { normalizeCreativeQaResult, buildCreativeQaPrompt } from "./creative-qa";

describe("normalizeCreativeQaResult", () => {
  it("normalizes a complete QA result", () => {
    const result = normalizeCreativeQaResult({
      status: "warning",
      checklist: {
        legibility: { status: "passed", note: "Readable." },
        ctaOffer: { status: "passed", note: "CTA preserved." },
        informationPreservation: { status: "warning", note: "Offer badge is close to the edge." },
        briefMatch: { status: "warning", note: "Audience could be clearer." },
        formatFit: { status: "passed", note: "Fits 4:5." },
        creativeRisk: { status: "warning", note: "Generic visual." },
      },
      issues: ["Audience could be clearer."],
      suggestions: ["Add audience-specific visual cues."],
    });

    expect(result.status).toBe("warning");
    expect(result.checklist.legibility.status).toBe("passed");
    expect(result.checklist.informationPreservation.status).toBe("warning");
    expect(result.issues).toEqual(["Audience could be clearer."]);
  });

  it("fills missing criteria with warning fallbacks", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {},
    });

    expect(result.status).toBe("warning");
    expect(result.checklist.legibility.status).toBe("warning");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("limits issues and suggestions", () => {
    const result = normalizeCreativeQaResult({
      status: "review",
      checklist: {},
      issues: ["1", "2", "3", "4"],
      suggestions: ["1", "2", "3", "4"],
    });

    expect(result.issues).toHaveLength(3);
    expect(result.suggestions).toHaveLength(3);
  });
});

describe("buildCreativeQaPrompt", () => {
  it("builds a QA prompt with CTA, offer, format, and campaign context", () => {
    const prompt = buildCreativeQaPrompt({
      campaign: {
        name: "Launch",
        client: "Acme",
        product: "Serum",
        offer: "20% off",
        objective: "Conversions",
        audience: "New buyers",
        tone: "Premium",
      },
      derivation: {
        ctaText: "Shop now",
        format: "4:5",
        generationMode: "art_variation",
      },
      locale: "en",
    });

    expect(prompt).toContain("Shop now");
    expect(prompt).toContain("20% off");
    expect(prompt).toContain("4:5");
    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("informationPreservation");
    expect(prompt).toContain("cropped, hidden, truncated, blurred, overlapped, deleted");
  });
});
