import { describe, it, expect } from "vitest";
import {
  STRATEGY_RECIPE_IDS,
  getStrategyRecipeCatalog,
  mapRecipeToGenerationConfig,
  rankRecipesForContext,
  countDerivationJobs,
  estimateCreditCost,
  getBatchCreditBreakdown,
  toCampaignPatch,
  type RecipeGenerationConfig,
  type RecipeSuggestionContext,
} from "./strategy-recipes";
import type { CreativeReadinessResult } from "./creative-readiness";

function readiness(overrides: Partial<CreativeReadinessResult>): CreativeReadinessResult {
  return {
    overallScore: 75,
    status: "ready",
    dimensions: [
      { id: "offerClarity", score: 75, suggestion: "" },
      { id: "textLegibility", score: 75, suggestion: "" },
      { id: "visualHierarchy", score: 75, suggestion: "" },
      { id: "ctaProminence", score: 75, suggestion: "" },
      { id: "brandFit", score: 75, suggestion: "" },
      { id: "platformFit", score: 75, suggestion: "" },
    ],
    blockingIssues: [],
    suggestions: [],
    canGenerate: true,
    source: {
      campaignId: "c1",
      assetId: "a1",
      preflightStatus: "completed",
    },
    ...overrides,
  };
}

describe("strategy-recipes", () => {
  it("exposes at least three recipes", () => {
    expect(STRATEGY_RECIPE_IDS.length).toBeGreaterThanOrEqual(3);
    expect(getStrategyRecipeCatalog()).toHaveLength(3);
  });

  it("maps safe_iteration to conservative art variation", () => {
    const config = mapRecipeToGenerationConfig("safe_iteration", {
      campaign: { ctaVariants: ["Buy Now"] },
    });
    expect(config.generationMode).toBe("art_variation");
    expect(config.creativeLevel).toBe("conservative");
    expect(config.preservationEmphasis).toBe("high");
    expect(config.ctaVariants).toEqual(["Buy Now"]);
  });

  it("maps performance_push to multiple CTAs", () => {
    const config = mapRecipeToGenerationConfig("performance_push", {
      campaign: { suggestedCta: "Get Started" },
    });
    expect(config.creativeLevel).toBe("bold");
    expect(config.ctaVariants.length).toBeGreaterThanOrEqual(2);
  });

  it("applies overrides without dropping recipe base", () => {
    const config = mapRecipeToGenerationConfig(
      "visual_differentiation",
      { campaign: { ctaVariants: ["A", "B", "C"] } },
      { creativeLevel: "bold", ctaVariants: ["Custom"] }
    );
    expect(config.creativeLevel).toBe("bold");
    expect(config.ctaVariants).toEqual(["Custom"]);
  });

  it("ranks safe_iteration first when readiness is blocked", () => {
    const context: RecipeSuggestionContext = {
      readiness: readiness({
        status: "blocked",
        overallScore: 40,
        canGenerate: false,
      }),
    };
    const ranked = rankRecipesForContext(context);
    expect(ranked[0].id).toBe("safe_iteration");
    expect(ranked[0].recommended).toBe(true);
  });

  it("ranks performance_push when CTA prominence is low", () => {
    const context: RecipeSuggestionContext = {
      readiness: readiness({
        dimensions: [
          { id: "ctaProminence", score: 40, suggestion: "Improve CTA" },
          { id: "offerClarity", score: 70, suggestion: "" },
          { id: "textLegibility", score: 70, suggestion: "" },
          { id: "visualHierarchy", score: 70, suggestion: "" },
          { id: "brandFit", score: 70, suggestion: "" },
          { id: "platformFit", score: 70, suggestion: "" },
        ],
        status: "needs_attention",
      }),
    };
    const ranked = rankRecipesForContext(context);
    expect(ranked[0].id).toBe("performance_push");
  });

  it("counts art variation jobs from CTA variants", () => {
    const config = mapRecipeToGenerationConfig("performance_push", {
      campaign: { ctaVariants: ["A", "B", "C"] },
    });
    expect(countDerivationJobs(config)).toBe(3);
  });

  it("counts format adaptation jobs from target formats", () => {
    const config = mapRecipeToGenerationConfig(
      "safe_iteration",
      { campaign: { ctaVariants: ["A"] } },
      {
        generationMode: "format_adaptation",
        targetFormats: ["1:1", "4:5"],
        ctaVariants: ["A"],
      }
    );
    expect(countDerivationJobs(config)).toBe(2);
  });

  it("estimates preview credit as single derivation cost", () => {
    const config = mapRecipeToGenerationConfig("performance_push", {
      campaign: { ctaVariants: ["A", "B", "C"] },
    });
    expect(estimateCreditCost(config, { preview: true })).toBe(5);
    expect(estimateCreditCost(config)).toBe(15);
  });

  it("getBatchCreditBreakdown returns mode-aware job counts", () => {
    const ctaConfig = mapRecipeToGenerationConfig("performance_push", {
      campaign: { ctaVariants: ["A", "B", "C"] },
    });
    expect(getBatchCreditBreakdown(ctaConfig)).toEqual({
      jobCount: 3,
      unitCost: 5,
      totalCredits: 15,
      generationMode: "art_variation",
    });

    const formatConfig: RecipeGenerationConfig = {
      generationMode: "format_adaptation",
      creativeLevel: "balanced",
      ctaVariants: [],
      targetFormats: ["1:1", "9:16"],
      preservationEmphasis: "medium",
    };
    expect(getBatchCreditBreakdown(formatConfig)).toEqual({
      jobCount: 2,
      unitCost: 5,
      totalCredits: 10,
      generationMode: "format_adaptation",
    });
  });

  it("getBatchCreditBreakdown returns zero jobs for empty CTAs or formats", () => {
    const emptyCtas: RecipeGenerationConfig = {
      generationMode: "art_variation",
      creativeLevel: "balanced",
      ctaVariants: [],
      preservationEmphasis: "medium",
    };
    expect(getBatchCreditBreakdown(emptyCtas).totalCredits).toBe(0);

    const emptyFormats: RecipeGenerationConfig = {
      generationMode: "format_adaptation",
      creativeLevel: "balanced",
      ctaVariants: [],
      targetFormats: [],
      preservationEmphasis: "medium",
    };
    expect(getBatchCreditBreakdown(emptyFormats).jobCount).toBe(0);
  });

  it("produces campaign patch shape", () => {
    const patch = toCampaignPatch(
      mapRecipeToGenerationConfig("safe_iteration", {
        campaign: { ctaVariants: ["Shop"] },
      })
    );
    expect(patch.generationMode).toBe("art_variation");
    expect(patch.ctaVariants).toEqual(["Shop"]);
  });
});
