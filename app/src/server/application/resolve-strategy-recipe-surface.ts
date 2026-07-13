/**
 * Phase 6 / item 49b: strategy recipe ranking, credits, and campaign patch
 * are calculated on the server — not imported into client hooks.
 */
import {
  buildRecommendedRecipePatch,
  estimateCreditCost,
  mapRecipeToGenerationConfig,
  rankRecipesForContext,
  toCampaignPatch,
  type RecipeGenerationConfig,
  type RecipeSuggestionContext,
  type StrategyRecipeId,
  type StrategyRecipeSurface,
} from "@/server/ai/strategy-recipes";
import { STRATEGY_RECIPE_IDS } from "@/lib/domain/strategy-recipe-types";

export type ResolveStrategyRecipeSurfaceInput = {
  context: RecipeSuggestionContext;
  selectedRecipeId?: StrategyRecipeId | null;
  overrides?: Partial<RecipeGenerationConfig> | null;
  /** Optional prefill for recommended one-click patch. */
  recommendedPrefill?: {
    recipeId?: StrategyRecipeId;
    config?: Partial<RecipeGenerationConfig>;
  } | null;
};

export function resolveStrategyRecipeSurface(
  input: ResolveStrategyRecipeSurfaceInput
): StrategyRecipeSurface {
  const context = input.context ?? {};
  const rankedRecipes = rankRecipesForContext(context);
  const defaultRecipeId = rankedRecipes[0]?.id ?? STRATEGY_RECIPE_IDS[0];
  const selectedRecipeId = input.selectedRecipeId ?? defaultRecipeId;
  const overrides = input.overrides ?? {};

  const resolvedConfig = mapRecipeToGenerationConfig(
    selectedRecipeId,
    context,
    overrides
  );
  const campaignPatch = toCampaignPatch(resolvedConfig);
  const recommendedRecipe = buildRecommendedRecipePatch(
    context,
    input.recommendedPrefill
  );

  return {
    rankedRecipes,
    selectedRecipeId,
    resolvedConfig,
    previewCredits: estimateCreditCost(resolvedConfig, { preview: true }),
    batchCredits: estimateCreditCost(resolvedConfig),
    campaignPatch,
    recommendedRecipe,
  };
}
