import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStrategyRecipe } from "./use-strategy-recipe";
import type { CreativeReadinessResult } from "@/server/ai/creative-readiness";

const blockedReadiness: CreativeReadinessResult = {
  overallScore: 40,
  status: "blocked",
  dimensions: [
    { id: "ctaProminence", score: 40, suggestion: "" },
    { id: "offerClarity", score: 40, suggestion: "" },
    { id: "textLegibility", score: 50, suggestion: "" },
    { id: "visualHierarchy", score: 50, suggestion: "" },
    { id: "brandFit", score: 50, suggestion: "" },
    { id: "platformFit", score: 50, suggestion: "" },
  ],
  blockingIssues: ["Blocked"],
  suggestions: [],
  canGenerate: false,
  source: { campaignId: "c1", assetId: "a1", preflightStatus: "completed" },
};

describe("useStrategyRecipe", () => {
  it("recommends safe_iteration when readiness is blocked", () => {
    const { result } = renderHook(() =>
      useStrategyRecipe({
        readiness: blockedReadiness,
        campaign: { ctaVariants: ["Buy"] },
      })
    );

    expect(result.current.rankedRecipes[0].id).toBe("safe_iteration");
    expect(result.current.rankedRecipes[0].recommended).toBe(true);
  });

  it("updates overrides and credit estimates", () => {
    const { result } = renderHook(() =>
      useStrategyRecipe({
        campaign: { ctaVariants: ["A", "B", "C"] },
      })
    );

    act(() => {
      result.current.selectRecipe("performance_push");
    });

    expect(result.current.previewCredits).toBe(5);
    expect(result.current.batchCredits).toBe(15);

    act(() => {
      result.current.setCtaVariants(["Only"]);
    });

    expect(result.current.batchCredits).toBe(5);
    expect(result.current.campaignPatch.ctaVariants).toEqual(["Only"]);
  });
});
