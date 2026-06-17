import { describe, expect, it } from "vitest";
import { mapOutputLearningToPrefill } from "./map-prefill";

describe("mapOutputLearningToPrefill", () => {
  it("maps CTA learning to art_variation prefill with recommended CTA first", () => {
    const prefill = mapOutputLearningToPrefill({
      variableKey: "cta",
      variableValue: "Comprar agora",
      existingCtas: ["Saiba mais"],
    });

    expect(prefill.generationMode).toBe("art_variation");
    expect(prefill.ctaVariants[0]).toBe("Comprar agora");
    expect(prefill.recipeId).toBe("performance_push");
  });

  it("maps format learning to format_adaptation with target format", () => {
    const prefill = mapOutputLearningToPrefill({
      variableKey: "format",
      variableValue: "9:16",
      existingCtas: ["Shop Now"],
    });

    expect(prefill.generationMode).toBe("format_adaptation");
    expect(prefill.targetFormats).toEqual(["9:16"]);
    expect(prefill.ctaVariants).toEqual(["Shop Now"]);
  });

  it("maps generation_mode learning to recipe", () => {
    const prefill = mapOutputLearningToPrefill({
      variableKey: "generation_mode",
      variableValue: "format_adaptation",
    });

    expect(prefill.recipeId).toBe("safe_iteration");
    expect(prefill.generationMode).toBe("format_adaptation");
  });

  it("maps style_policy learning to creative level", () => {
    const prefill = mapOutputLearningToPrefill({
      variableKey: "style_policy",
      variableValue: "strong",
    });

    expect(prefill.creativeLevel).toBe("bold");
    expect(prefill.recipeId).toBe("visual_differentiation");
  });
});
