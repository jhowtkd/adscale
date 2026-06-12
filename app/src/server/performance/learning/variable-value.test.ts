import { describe, expect, it } from "vitest";
import { extractVariableValue, normalizeVariableKey } from "./variable-value";

describe("variable value extraction", () => {
  it("normalizes aliases", () => {
    expect(normalizeVariableKey("cta_text")).toBe("cta");
    expect(normalizeVariableKey("generation_mode")).toBe("recipe");
  });

  it("extracts CTA and format from derivations", () => {
    const derivation = {
      id: "d1",
      campaignId: "c1",
      format: "story",
      generationMode: "art_variation",
      ctaText: "Comprar agora",
      styleAssetId: null,
    };
    const campaign = { generationMode: "restyling", styleIntensity: "high" };

    expect(extractVariableValue("cta", derivation, campaign)).toBe("Comprar agora");
    expect(extractVariableValue("format", derivation, campaign)).toBe("story");
    expect(extractVariableValue("recipe", derivation, campaign)).toBe("art_variation");
    expect(extractVariableValue("style", derivation, campaign)).toBe("high");
  });
});
