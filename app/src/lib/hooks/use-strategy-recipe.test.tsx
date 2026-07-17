import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useRecommendedRecipePatch,
  useStrategyRecipe,
} from "./use-strategy-recipe";
import type { RecipeReadinessSnapshot } from "@/lib/domain/strategy-recipe-types";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
import { resolveStrategyRecipeSurface } from "@/server/application/resolve-strategy-recipe-surface";

const mockApiFetch = vi.mocked(apiFetch);

const blockedReadiness: RecipeReadinessSnapshot = {
  overallScore: 40,
  status: "blocked",
  canGenerate: false,
  dimensions: [
    { id: "ctaProminence", score: 40 },
    { id: "offerClarity", score: 40 },
    { id: "textLegibility", score: 50 },
    { id: "visualHierarchy", score: 50 },
    { id: "brandFit", score: 50 },
    { id: "platformFit", score: 50 },
  ],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockApiFetch.mockImplementation(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit)?.body ?? "{}"));
    const surface = resolveStrategyRecipeSurface({
      context: body.context ?? {},
      selectedRecipeId: body.selectedRecipeId,
      overrides: body.overrides,
    });
    return new Response(JSON.stringify(surface), { status: 200 });
  });
});

describe("useStrategyRecipe", () => {
  it("labels panel and recommended requests independently", async () => {
    const panel = renderHook(() => useStrategyRecipe({}), { wrapper });
    const recommended = renderHook(() => useRecommendedRecipePatch({}), {
      wrapper,
    });

    await waitFor(() => {
      expect(panel.result.current.isLoading).toBe(false);
      expect(recommended.result.current.isLoading).toBe(false);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/strategy-recipe/resolve?source=panel",
      expect.any(Object)
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/strategy-recipe/resolve?source=recommended",
      expect.any(Object)
    );
  });

  it("recommends safe_iteration when readiness is blocked", async () => {
    const { result } = renderHook(
      () =>
        useStrategyRecipe({
          readiness: blockedReadiness,
          campaign: { ctaVariants: ["Buy"] },
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.rankedRecipes[0]?.id).toBe("safe_iteration");
    });
    expect(result.current.rankedRecipes[0]?.recommended).toBe(true);
  });

  it("preserves manual recipe selection when readiness updates", async () => {
    const { result, rerender } = renderHook(
      ({ readiness }: { readiness?: RecipeReadinessSnapshot | null }) =>
        useStrategyRecipe({
          readiness,
          campaign: { ctaVariants: ["Buy"] },
        }),
      {
        wrapper,
        initialProps: {
          readiness: undefined as RecipeReadinessSnapshot | undefined,
        },
      }
    );

    await waitFor(() => expect(result.current.rankedRecipes.length).toBeGreaterThan(0));

    act(() => {
      result.current.selectRecipe("performance_push");
    });

    rerender({ readiness: blockedReadiness });

    await waitFor(() => {
      expect(result.current.rankedRecipes[0]?.id).toBe("safe_iteration");
    });
    expect(result.current.selectedRecipeId).toBe("performance_push");
  });

  it("updates overrides and credit estimates via server surface", async () => {
    const { result } = renderHook(
      () =>
        useStrategyRecipe({
          campaign: { ctaVariants: ["A", "B", "C"] },
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.rankedRecipes.length).toBeGreaterThan(0));

    act(() => {
      result.current.selectRecipe("performance_push");
    });

    await waitFor(() => {
      expect(result.current.previewCredits).toBe(5);
      expect(result.current.batchCredits).toBe(15);
    });

    act(() => {
      result.current.setCtaVariants(["Only"]);
    });

    await waitFor(() => {
      expect(result.current.batchCredits).toBe(5);
      expect(result.current.campaignPatch.ctaVariants).toEqual(["Only"]);
    });
  });
});
