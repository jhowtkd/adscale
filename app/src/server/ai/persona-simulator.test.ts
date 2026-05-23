import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-5-mini",
  },
}));

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate };
  },
}));

import {
  buildPersonaSimulationPrompt,
  normalizePersonaSimulationResults,
  simulatePersonas,
} from "./persona-simulator";

const baseInput = {
  campaign: {
    objective: "Conversion",
    audience: "Women 25-34",
    offer: "20% off",
    ctaText: "Shop Now",
    tone: "Bold",
    constraints: "No red backgrounds",
    clientName: "Acme",
    productName: "Serum",
  },
  creative: {
    type: "derivation" as const,
    description: "A vibrant summer ad with bold typography",
  },
  locale: "en" as const,
};

describe("buildPersonaSimulationPrompt", () => {
  it("includes campaign context", () => {
    const prompt = buildPersonaSimulationPrompt(baseInput);

    expect(prompt).toContain("Conversion");
    expect(prompt).toContain("Women 25-34");
    expect(prompt).toContain("20% off");
    expect(prompt).toContain("Shop Now");
    expect(prompt).toContain("Bold");
    expect(prompt).toContain("No red backgrounds");
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("Serum");
  });

  it("includes creative description", () => {
    const prompt = buildPersonaSimulationPrompt(baseInput);

    expect(prompt).toContain("derivation");
    expect(prompt).toContain("A vibrant summer ad with bold typography");
  });

  it("includes all 4 personas", () => {
    const prompt = buildPersonaSimulationPrompt(baseInput);

    expect(prompt).toContain("Skeptical Buyer");
    expect(prompt).toContain("Warm Lead");
    expect(prompt).toContain("Financial Decision Maker");
    expect(prompt).toContain("Beginner");
  });

  it("uses Portuguese labels for pt-BR locale", () => {
    const prompt = buildPersonaSimulationPrompt({ ...baseInput, locale: "pt-BR" });

    expect(prompt).toContain("Comprador Cético");
    expect(prompt).toContain("Lead Aquecido");
    expect(prompt).toContain("Decisor Financeiro");
    expect(prompt).toContain("Iniciante");
    expect(prompt).toContain("português brasileiro");
  });

  it("requests JSON output", () => {
    const prompt = buildPersonaSimulationPrompt(baseInput);

    expect(prompt).toContain("JSON");
    expect(prompt).toContain("skeptical_buyer");
    expect(prompt).toContain("understands");
    expect(prompt).toContain("wouldClick");
    expect(prompt).toContain("rationale");
  });
});

describe("normalizePersonaSimulationResults", () => {
  it("normalizes a complete valid result", () => {
    const raw = {
      skeptical_buyer: {
        understands: "The offer",
        rejects: "The price",
        wants: "A discount",
        wouldClick: false,
        rationale: "Too expensive",
      },
      warm_lead: {
        understands: "The offer",
        rejects: "Nothing",
        wants: "To buy",
        wouldClick: true,
        rationale: "Ready to buy",
      },
      financial_decision_maker: {
        understands: "ROI",
        rejects: "Vague terms",
        wants: "Numbers",
        wouldClick: false,
        rationale: "Needs data",
      },
      beginner: {
        understands: "Simple message",
        rejects: "Jargon",
        wants: "Help",
        wouldClick: true,
        rationale: "Friendly",
      },
    };

    const result = normalizePersonaSimulationResults(raw);

    expect(result.skeptical_buyer.understands).toBe("The offer");
    expect(result.skeptical_buyer.wouldClick).toBe(false);
    expect(result.warm_lead.wouldClick).toBe(true);
  });

  it("fills missing fields with safe defaults", () => {
    const raw = {
      skeptical_buyer: { understands: "Something" },
    };

    const result = normalizePersonaSimulationResults(raw);

    expect(result.skeptical_buyer.understands).toBe("Something");
    expect(result.skeptical_buyer.rejects).toBe("");
    expect(result.skeptical_buyer.wants).toBe("");
    expect(result.skeptical_buyer.wouldClick).toBe(false);
    expect(result.skeptical_buyer.rationale).toBe("");
    expect(result.warm_lead.understands).toBe("");
  });

  it("returns safe defaults for completely invalid input", () => {
    const result = normalizePersonaSimulationResults(null);

    expect(result.skeptical_buyer.understands).toBe("");
    expect(result.beginner.wouldClick).toBe(false);
  });
});

describe("simulatePersonas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls OpenAI and returns normalized results", async () => {
    const openaiResponse = {
      skeptical_buyer: {
        understands: "Offer",
        rejects: "Price",
        wants: "Discount",
        wouldClick: false,
        rationale: "Too high",
      },
      warm_lead: {
        understands: "Offer",
        rejects: "None",
        wants: "Buy",
        wouldClick: true,
        rationale: "Ready",
      },
      financial_decision_maker: {
        understands: "ROI",
        rejects: "Vague",
        wants: "Data",
        wouldClick: false,
        rationale: "Needs proof",
      },
      beginner: {
        understands: "Simple",
        rejects: "Jargon",
        wants: "Help",
        wouldClick: true,
        rationale: "Clear",
      },
    };

    mockCreate.mockResolvedValue({
      output_text: JSON.stringify(openaiResponse),
    });

    const result = await simulatePersonas(baseInput);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        text: { format: { type: "json_object" } },
      })
    );
    expect(result.skeptical_buyer.wouldClick).toBe(false);
    expect(result.warm_lead.wouldClick).toBe(true);
  });

  it("throws when OpenAI returns empty response", async () => {
    mockCreate.mockResolvedValue({ output_text: "" });

    await expect(simulatePersonas(baseInput)).rejects.toThrow("Empty response from persona simulator");
  });

  it("strips code fences from response", async () => {
    const openaiResponse = {
      skeptical_buyer: { understands: "A", rejects: "B", wants: "C", wouldClick: true, rationale: "D" },
      warm_lead: { understands: "A", rejects: "B", wants: "C", wouldClick: true, rationale: "D" },
      financial_decision_maker: { understands: "A", rejects: "B", wants: "C", wouldClick: true, rationale: "D" },
      beginner: { understands: "A", rejects: "B", wants: "C", wouldClick: true, rationale: "D" },
    };

    mockCreate.mockResolvedValue({
      output_text: "```json\n" + JSON.stringify(openaiResponse) + "\n```",
    });

    const result = await simulatePersonas(baseInput);
    expect(result.skeptical_buyer.understands).toBe("A");
  });
});
