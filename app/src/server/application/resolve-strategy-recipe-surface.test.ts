import { describe, expect, it } from "vitest";
import { resolveStrategyRecipeSurface } from "./resolve-strategy-recipe-surface";

describe("resolveStrategyRecipeSurface", () => {
  it("ranks safe_iteration first when readiness is blocked", () => {
    const surface = resolveStrategyRecipeSurface({
      context: {
        readiness: {
          status: "blocked",
          overallScore: 40,
          canGenerate: false,
          dimensions: [{ id: "ctaProminence", score: 40 }],
        },
        campaign: { ctaVariants: ["Buy"] },
      },
    });

    expect(surface.rankedRecipes[0]?.id).toBe("safe_iteration");
    expect(surface.rankedRecipes[0]?.recommended).toBe(true);
    expect(surface.selectedRecipeId).toBe("safe_iteration");
    expect(surface.recommendedRecipe.recipeId).toBe("safe_iteration");
    expect(surface.previewCredits).toBe(5);
  });

  it("honors manual selection and override CTAs for batch credits", () => {
    const surface = resolveStrategyRecipeSurface({
      context: {
        campaign: { ctaVariants: ["A", "B", "C"] },
      },
      selectedRecipeId: "performance_push",
      overrides: { ctaVariants: ["Only"] },
    });

    expect(surface.selectedRecipeId).toBe("performance_push");
    expect(surface.batchCredits).toBe(5);
    expect(surface.campaignPatch.ctaVariants).toEqual(["Only"]);
  });
});
