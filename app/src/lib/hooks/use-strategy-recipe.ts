"use client";

import { useCallback, useMemo, useState } from "react";
import type { CreativeReadinessResult } from "@/server/ai/creative-readiness";
import {
  STRATEGY_RECIPE_IDS,
  estimateCreditCost,
  mapRecipeToGenerationConfig,
  rankRecipesForContext,
  toCampaignPatch,
  type BrandKitSnapshot,
  type CampaignRecipeContext,
  type RecipeCreativeLevel,
  type RecipeGenerationConfig,
  type RecipeSuggestionContext,
  type StrategyRecipeId,
} from "@/server/ai/strategy-recipes";

export interface StrategyRecipePrefill {
  recipeId?: StrategyRecipeId;
  config?: Partial<RecipeGenerationConfig>;
}

export interface UseStrategyRecipeInput {
  readiness?: CreativeReadinessResult | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
  /** Increment when the recipe modal reopens to clear manual selection. */
  resetKey?: number;
  /** Optional prefill from performance recommendation accept/edit. */
  initialPrefill?: StrategyRecipePrefill | null;
}

export function useStrategyRecipe(input: UseStrategyRecipeInput) {
  const context = useMemo<RecipeSuggestionContext>(
    () => ({
      readiness: input.readiness,
      brandKit: input.brandKit,
      campaign: input.campaign,
    }),
    [input.readiness, input.brandKit, input.campaign]
  );

  const ranked = useMemo(() => rankRecipesForContext(context), [context]);
  const defaultRecipeId = ranked[0]?.id ?? STRATEGY_RECIPE_IDS[0];

  const [manualRecipeId, setManualRecipeId] = useState<StrategyRecipeId | null>(null);
  const [overrides, setOverrides] = useState<Partial<RecipeGenerationConfig>>({});
  const [appliedResetKey, setAppliedResetKey] = useState(input.resetKey);

  if (input.resetKey !== undefined && input.resetKey !== appliedResetKey) {
    setAppliedResetKey(input.resetKey);
    setManualRecipeId(input.initialPrefill?.recipeId ?? null);
    setOverrides(input.initialPrefill?.config ?? {});
  }

  const selectedRecipeId = manualRecipeId ?? defaultRecipeId;

  const resolvedConfig = useMemo(
    () => mapRecipeToGenerationConfig(selectedRecipeId, context, overrides),
    [selectedRecipeId, context, overrides]
  );

  const previewCredits = useMemo(
    () => estimateCreditCost(resolvedConfig, { preview: true }),
    [resolvedConfig]
  );

  const batchCredits = useMemo(
    () => estimateCreditCost(resolvedConfig),
    [resolvedConfig]
  );

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

  const campaignPatch = useMemo(
    () => toCampaignPatch(resolvedConfig),
    [resolvedConfig]
  );

  return {
    rankedRecipes: ranked,
    selectedRecipeId,
    resolvedConfig,
    overrides,
    previewCredits,
    batchCredits,
    selectRecipe,
    setCreativeLevel,
    setCtaVariants,
    setGenerationMode,
    setTargetFormats,
    resetOverrides,
    campaignPatch,
  };
}
