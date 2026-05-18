import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-4o",
  },
}));

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate };
  },
}));

import {
  buildLandingPagePrompt,
  normalizeLandingPageStructure,
  generateLandingPageStructure,
} from "./landing-page";

const baseCampaign = {
  name: "Summer Sale",
  client: "Acme Fashion",
  product: "Linen dress",
  objective: "Conversion",
  audience: "Women 25-34",
  offer: "20% off",
  tone: "Bold",
  constraints: "No red backgrounds",
  notes: "Keep a premium but accessible feel",
  ctaVariants: ["Shop Now", "Buy Today"],
};

const baseDerivation = {
  prompt: "A vibrant summer ad with bold typography",
  ctaText: "Shop Now",
  format: "1:1",
};

describe("buildLandingPagePrompt", () => {
  it("includes campaign client, product, objective, audience, offer, CTA variants, constraints, and notes", () => {
    const prompt = buildLandingPagePrompt(baseCampaign, baseDerivation);

    expect(prompt).toContain("Summer Sale");
    expect(prompt).toContain("Acme Fashion");
    expect(prompt).toContain("Linen dress");
    expect(prompt).toContain("Conversion");
    expect(prompt).toContain("Women 25-34");
    expect(prompt).toContain("20% off");
    expect(prompt).toContain("No red backgrounds");
    expect(prompt).toContain("Keep a premium but accessible feel");
    expect(prompt).toContain("Shop Now");
    expect(prompt).toContain("Buy Today");
  });

  it("includes derivation context", () => {
    const prompt = buildLandingPagePrompt(baseCampaign, baseDerivation);

    expect(prompt).toContain("A vibrant summer ad with bold typography");
    expect(prompt).toContain("1:1");
  });

  it("avoids requiring fake proof claims", () => {
    const prompt = buildLandingPagePrompt(baseCampaign, baseDerivation);

    expect(prompt).toContain("Do not invent testimonials");
    expect(prompt).toContain("Do not require fake proof");
  });
});

describe("normalizeLandingPageStructure", () => {
  it("accepts a complete valid structure", () => {
    const structure = {
      title: "Summer Sale LP",
      sections: {
        hero: { eyebrow: "Limited time", headline: "Hero", body: "Body", cta: "Go" },
        problem: { headline: "Problem", body: "Body", bullets: ["a", "b"] },
        solution: { headline: "Solution", body: "Body", bullets: ["c"] },
        benefits: { headline: "Benefits", body: "Body", bullets: ["d"] },
        trust: { headline: "Trust", body: "Body" },
        offer: { headline: "Offer", body: "Body", cta: "Claim" },
        faq: {
          headline: "FAQ",
          items: [{ question: "Q1", answer: "A1" }],
        },
        finalCta: { headline: "Final", body: "Body", cta: "End" },
      },
    };

    const result = normalizeLandingPageStructure(structure);

    expect(result.title).toBe("Summer Sale LP");
    expect(result.sections.hero.headline).toBe("Hero");
    expect(result.sections.faq.items).toHaveLength(1);
  });

  it("fills missing required sections with safe defaults", () => {
    const result = normalizeLandingPageStructure({
      title: "X",
      sections: {},
    });

    expect(result.sections.hero.headline).toBe("Welcome");
    expect(result.sections.problem.headline).toBe("problem");
    expect(result.sections.solution.body).toBe("");
  });

  it("filters invalid bullets and FAQ items", () => {
    const result = normalizeLandingPageStructure({
      title: "X",
      sections: {
        problem: {
          headline: "P",
          body: "B",
          bullets: ["valid", "", 123, null],
        },
        faq: {
          headline: "F",
          items: [
            { question: "Q", answer: "A" },
            { question: "Q2" },
            null,
            "invalid",
          ],
        },
      },
    });

    expect(result.sections.problem.bullets).toEqual(["valid"]);
    expect(result.sections.faq.items).toHaveLength(1);
  });
});

describe("generateLandingPageStructure", () => {
  it("calls OpenAI and normalizes the response", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        title: "Generated LP",
        sections: {
          hero: { headline: "H", body: "B", cta: "C" },
          problem: { headline: "P", body: "B" },
          solution: { headline: "S", body: "B" },
          benefits: { headline: "Be", body: "B" },
          trust: { headline: "T", body: "B" },
          offer: { headline: "O", body: "B", cta: "C" },
          faq: { headline: "F", items: [{ question: "Q", answer: "A" }] },
          finalCta: { headline: "FC", body: "B", cta: "C" },
        },
      }),
    });

    const result = await generateLandingPageStructure(baseCampaign, baseDerivation);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.title).toBe("Generated LP");
    expect(result.sections.hero.headline).toBe("H");
  });
});
