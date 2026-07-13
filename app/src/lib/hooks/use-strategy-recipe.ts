"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import {
  STRATEGY_RECIPE_IDS,
  type BrandKitSnapshot,
  type CampaignRecipeContext,
  type CampaignRecipePatch,
  type RecipeCreativeLevel,
  type RecipeGenerationConfig,
  type RecipeSuggestionContext,
  type StrategyRecipeId,
  type StrategyRecipeSurface,
} from "@/lib/domain/strategy-recipe-types";
import type { RecipeReadinessSnapshot } from "@/lib/domain/strategy-recipe-types";

export type { StrategyRecipeId, RecipeGenerationConfig, CampaignRecipePatch };
export type { BrandKitSnapshot, CampaignRecipeContext };

export interface StrategyRecipePrefill {
  recipeId?: StrategyRecipeId;
  config?: Partial<RecipeGenerationConfig>;
}

export interface UseStrategyRecipeInput {
  readiness?: RecipeReadinessSnapshot | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
  /** Increment when the recipe modal reopens to clear manual selection. */
  resetKey?: number;
  /** Optional prefill from performance recommendation accept/edit. */
  initialPrefill?: StrategyRecipePrefill | null;
  /** When false, skip network (e.g. closed modal). Default true. */
  enabled?: boolean;
}

async function fetchStrategyRecipeSurface(body: {
  context: RecipeSuggestionContext;
  selectedRecipeId?: StrategyRecipeId | null;
  overrides?: Partial<RecipeGenerationConfig> | null;
}): Promise<StrategyRecipeSurface> {
  const res = await apiFetch("/api/strategy-recipe/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.error === "string" ? err.error : "Failed to resolve strategy recipe"
    );
  }
  return res.json() as Promise<StrategyRecipeSurface>;
}

const EMPTY_SURFACE: StrategyRecipeSurface = {
  rankedRecipes: STRATEGY_RECIPE_IDS.map((id, i) => ({
    id,
    score: 0,
    recommended: i === 0,
  })),
  selectedRecipeId: STRATEGY_RECIPE_IDS[0],
  resolvedConfig: {
    generationMode: "art_variation",
    creativeLevel: "balanced",
    ctaVariants: [],
    preservationEmphasis: "medium",
  },
  previewCredits: 0,
  batchCredits: 0,
  campaignPatch: {
    generationMode: "art_variation",
    creativeLevel: "balanced",
    ctaVariants: [],
  },
  recommendedRecipe: {
    recipeId: STRATEGY_RECIPE_IDS[0],
    generationMode: "art_variation",
    creativeLevel: "balanced",
    ctaVariants: [],
  },
};

/**
 * Client orchestration for strategy recipes (Phase 6 / item 49b).
 * Ranking, credit math, and campaign patches are server-derived only.
 */
export function useStrategyRecipe(input: UseStrategyRecipeInput) {
  const enabled = input.enabled ?? true;

  const context = useMemo<RecipeSuggestionContext>(
    () => ({
      readiness: input.readiness,
      brandKit: input.brandKit,
      campaign: input.campaign,
    }),
    [input.readiness, input.brandKit, input.campaign]
  );

  const [manualRecipeId, setManualRecipeId] = useState<StrategyRecipeId | null>(
    null
  );
  const [overrides, setOverrides] = useState<Partial<RecipeGenerationConfig>>(
    {}
  );
  const [appliedResetKey, setAppliedResetKey] = useState(input.resetKey);

  if (input.resetKey !== undefined && input.resetKey !== appliedResetKey) {
    setAppliedResetKey(input.resetKey);
    setManualRecipeId(input.initialPrefill?.recipeId ?? null);
    setOverrides(input.initialPrefill?.config ?? {});
  }

  const surfaceQuery = useQuery({
    queryKey: [
      "strategy-recipe-surface",
      context,
      manualRecipeId,
      overrides,
    ],
    queryFn: () =>
      fetchStrategyRecipeSurface({
        context,
        selectedRecipeId: manualRecipeId,
        overrides,
      }),
    enabled,
    staleTime: STALE_TIME.DYNAMIC,
    placeholderData: (prev) => prev,
  });

  const surface = surfaceQuery.data ?? EMPTY_SURFACE;
  const selectedRecipeId = manualRecipeId ?? surface.selectedRecipeId;

  const selectRecipe = useCallback((id: StrategyRecipeId) => {
    setManualRecipeId(id);
    setOverrides({});
  }, []);

  const setCreativeLevel = useCallback((creativeLevel: RecipeCreativeLevel) => {
    setOverrides((prev) => ({ ...prev, creativeLevel }));
  }, []);

  const setCtaVariants = useCallback((ctaVariants: string[]) => {
    setOverrides((prev) => ({ ...prev, ctaVariants }));
  }, []);

  const setGenerationMode = useCallback(
    (generationMode: "art_variation" | "format_adaptation") => {
      setOverrides((prev) => ({ ...prev, generationMode }));
    },
    []
  );

  const setTargetFormats = useCallback((targetFormats: string[]) => {
    setOverrides((prev) => ({ ...prev, targetFormats }));
  }, []);

  const resetOverrides = useCallback(() => {
    setOverrides({});
  }, []);

  return {
    rankedRecipes: surface.rankedRecipes,
    selectedRecipeId,
    resolvedConfig: surface.resolvedConfig,
    overrides,
    previewCredits: surface.previewCredits,
    batchCredits: surface.batchCredits,
    selectRecipe,
    setCreativeLevel,
    setCtaVariants,
    setGenerationMode,
    setTargetFormats,
    resetOverrides,
    campaignPatch: surface.campaignPatch,
    recommendedRecipe: surface.recommendedRecipe,
    isLoading: surfaceQuery.isLoading,
    isError: surfaceQuery.isError,
    refetch: surfaceQuery.refetch,
  };
}

/** Lightweight recommended patch for one-click generate (action bar). */
export function useRecommendedRecipePatch(input: {
  readiness?: RecipeReadinessSnapshot | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
  enabled?: boolean;
}) {
  const context = useMemo(
    () => ({
      readiness: input.readiness,
      brandKit: input.brandKit,
      campaign: input.campaign,
    }),
    [input.readiness, input.brandKit, input.campaign]
  );

  const query = useQuery({
    queryKey: ["strategy-recipe-recommended", context],
    queryFn: () =>
      fetchStrategyRecipeSurface({
        context,
        selectedRecipeId: null,
        overrides: null,
      }),
    enabled: input.enabled ?? true,
    staleTime: STALE_TIME.DYNAMIC,
  });

  return {
    recommendedRecipe:
      query.data?.recommendedRecipe ?? EMPTY_SURFACE.recommendedRecipe,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
