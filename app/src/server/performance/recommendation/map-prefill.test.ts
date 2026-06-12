import { describe, expect, it } from "vitest";
import { mapLearningToPrefill } from "./map-prefill";

describe("mapLearningToPrefill", () => {
  it("maps CTA learning to art_variation prefill with recommended CTA first", () => {
    const prefill = mapLearningToPrefill({
      variableKey: "cta",
      variableValue: "Comprar agora",
      existingCtas: ["Saiba mais"],
    });

    expect(prefill.generationMode).toBe("art_variation");
    expect(prefill.ctaVariants[0]).toBe("Comprar agora");
    expect(prefill.recipeId).toBe("performance_push");
  });

  it("maps format learning to format_adaptation with target format", () => {
    const prefill = mapLearningToPrefill({
      variableKey: "format",
      variableValue: "9:16",
      existingCtas: ["Shop Now"],
    });

    expect(prefill.generationMode).toBe("format_adaptation");
    expect(prefill.targetFormats).toEqual(["9:16"]);
    expect(prefill.ctaVariants).toEqual(["Shop Now"]);
  });

  it("maps recipe learning from generation mode", () => {
    const prefill = mapLearningToPrefill({
      variableKey: "recipe",
      variableValue: "format_adaptation",
    });

    expect(prefill.recipeId).toBe("safe_iteration");
  });

  it("maps style learning to creative level", () => {
    const prefill = mapLearningToPrefill({
      variableKey: "style",
      variableValue: "strong",
    });

    expect(prefill.creativeLevel).toBe("bold");
    expect(prefill.recipeId).toBe("visual_differentiation");
  });
});
