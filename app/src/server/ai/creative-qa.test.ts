import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-4o",
  },
}));

import {
  normalizeCreativeQaResult,
  buildCreativeQaPrompt,
  extractObservableRubricSection,
} from "./creative-qa";

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
    expect(prompt).toContain("Passagem Olhar");
    expect(prompt).toContain("Exportacao");
    expect(prompt).toMatch(/invented facts, wrong brand, unsupported offers/i);
    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("informationPreservation");
    expect(prompt).toContain("cropped, hidden, truncated, blurred, overlapped, deleted");
    expect(prompt).toMatch(/Checklist keys: legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk/);
    expect(prompt).toContain("Allowed status values: ready, warning, review.");
  });
});

describe("QA compliance boundary wording", () => {
  const promptInput = {
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
  };

  it("allows CTA absence and paraphrase", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).toMatch(/CTA absence and paraphrase are allowed/i);
    expect(prompt).toMatch(/preserves? the (?:same )?action intent/i);
  });

  it("does not demand character-for-character CTA fidelity", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).not.toMatch(/character-for-character/i);
    expect(prompt).not.toMatch(/Flag ctaOffer as failed on any substitution, paraphrase/i);
  });

  it("reserves failed compliance for objective defects", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).toMatch(/invented or incorrect facts/i);
    expect(prompt).toMatch(/unusable .*format|format .*unusable/i);
    expect(prompt).toMatch(/corruption/i);
    expect(prompt).toMatch(/cropping/i);
  });

  it("routes art-direction observations to creativeRisk as ranking advice", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).toMatch(/creativeRisk.*(?:ranking|advice|advisory)/i);
    expect(prompt).not.toMatch(
      /failed.*(?:on checklist criteria when observable defects are present.*)?especially visual overload/is
    );
  });
});

describe("observable rubric in QA prompt", () => {
  const baseInput = {
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

  it("does not contain export-softening bias (RUBR-03)", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    expect(prompt).not.toMatch(/Export must remain allowed/i);
  });

  it("includes integrity-first failed-criteria language", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    expect(prompt).toMatch(/failed.*checklist|checklist.*failed/i);
  });

  it("includes advisory observable rubric sections", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    const section = extractObservableRubricSection(prompt);
    expect(section.length).toBeGreaterThan(0);
    expect(section).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(section).toMatch(/ART DIRECTION \(ranking guidance\)/);
    expect(section).not.toMatch(/Mark failed/i);
  });

  it("preserves checklist keys and JSON return instruction after rubric injection", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    expect(prompt).toContain("Return only JSON with status, checklist, issues, and suggestions.");
    expect(prompt).toMatch(/Checklist keys: legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk/);
    expect(prompt).toContain("Allowed status values: ready, warning, review.");
  });
});

describe("styleFidelity criterion", () => {
  const baseCampaign = {
    name: "Test Campaign",
    client: "Acme",
    product: "Widget",
    offer: "10% off",
    objective: "Conversions",
    audience: "Adults 25-45",
  };

  it("buildCreativeQaPrompt includes styleFidelity checklist key for restyling mode", () => {
    const prompt = buildCreativeQaPrompt({
      locale: "pt-BR",
      campaign: baseCampaign,
      derivation: {
        ctaText: null,
        format: "1:1",
        generationMode: "restyling",
      },
      contract: {
        generationMode: "restyling",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: "base-1",
        styleAssetId: "style-1",
        client: "Acme",
        product: "Widget",
        offer: "10% off",
        constraints: null,
      },
    });
    expect(prompt).toContain("styleFidelity");
    expect(prompt.toLowerCase()).toContain("style reference");
    expect(prompt.toLowerCase()).toContain("factual");
  });

  it("buildCreativeQaPrompt does NOT include styleFidelity for art_variation mode", () => {
    const prompt = buildCreativeQaPrompt({
      locale: "pt-BR",
      campaign: baseCampaign,
      derivation: {
        ctaText: "Comprar",
        format: "1:1",
        generationMode: "art_variation",
      },
      contract: {
        generationMode: "art_variation",
        targetFormat: "1:1",
        ctaSemantics: { kind: "explicit", text: "Comprar" },
        baseAssetId: "base-1",
        styleAssetId: null,
        client: "Acme",
        product: "Widget",
        offer: "10% off",
        constraints: null,
      },
    });
    expect(prompt).not.toContain("styleFidelity");
  });

  it("normalizeCreativeQaResult includes styleFidelity when present in model response", () => {
    const result = normalizeCreativeQaResult({
      status: "warning",
      checklist: {
        legibility: { status: "passed", note: "OK" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
        styleFidelity: { status: "failed", note: "Brand name from style reference copied." },
      },
      issues: ["Brand name from style reference copied."],
      suggestions: [],
    });
    expect(result.checklist.styleFidelity).toBeDefined();
    expect(result.checklist.styleFidelity?.status).toBe("failed");
  });

  it("ignores unknown checklist keys", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {
        legibility: { status: "passed", note: "OK" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
        randomKey: { status: "failed", note: "Should be ignored." },
      },
      issues: [],
      suggestions: [],
    });
    expect((result.checklist as Record<string, unknown>)["randomKey"]).toBeUndefined();
    expect(result.status).toBe("ready");
  });

  it("forces warning when model sent ready but all core criteria use fallback notes", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {},
    });
    expect(result.status).toBe("warning");
  });

  it("respects model status when partial real notes exist", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {
        legibility: { status: "passed", note: "Readable." },
        ctaOffer: { status: "passed", note: "CTA preserved." },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      issues: [],
      suggestions: [],
    });
    expect(result.status).toBe("ready");
  });

  it("normalizeCreativeQaResult does not add styleFidelity fallback when absent", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {
        legibility: { status: "passed", note: "OK" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      issues: [],
      suggestions: [],
    });
    expect(result.checklist.styleFidelity).toBeUndefined();
  });
});
