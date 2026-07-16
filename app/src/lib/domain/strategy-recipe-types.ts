/**
 * Presentation-safe strategy recipe types/IDs (Phase 6 / item 49b).
 * Domain ranking, credit math, and patch building live on the server only.
 */

export const STRATEGY_RECIPE_IDS = [
  "safe_iteration",
  "performance_push",
  "visual_differentiation",
] as const;

export type StrategyRecipeId = (typeof STRATEGY_RECIPE_IDS)[number];

export type PreservationEmphasis = "high" | "medium" | "low";

export type RecipeCreativeLevel =
  | "conservative"
  | "balanced"
  | "bold"
  | "extreme";

export interface RecipeGenerationConfig {
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: RecipeCreativeLevel;
  ctaVariants: string[];
  targetFormats?: string[];
  preservationEmphasis: PreservationEmphasis;
  styleIntensity?: "soft" | "medium" | "strong";
}

export interface StrategyRecipeDefinition {
  id: StrategyRecipeId;
  defaultConfig: RecipeGenerationConfig;
}

export interface BrandKitSnapshot {
  constraints?: string | null;
  toneOfVoice?: string | null;
  prohibitedElements?: string | null;
}

export interface CampaignRecipeContext {
  ctaVariants?: string[] | null;
  targetFormats?: string[] | null;
  platforms?: string[] | null;
  generationMode?: string | null;
  creativeLevel?: string | null;
  suggestedCta?: string | null;
}

/** Minimal readiness shape needed for ranking (avoids pulling full creative-readiness module into UI). */
export interface RecipeReadinessSnapshot {
  status?: "ready" | "needs_attention" | "blocked" | string;
  overallScore?: number;
  canGenerate?: boolean;
  dimensions?: Array<{ id: string; score: number }>;
}

export interface RecipeSuggestionContext {
  readiness?: RecipeReadinessSnapshot | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
}

export interface RankedRecipe {
  id: StrategyRecipeId;
  score: number;
  recommended: boolean;
}

export type CampaignRecipePatch = {
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: RecipeCreativeLevel;
  ctaVariants: string[];
  targetFormats?: string[];
};

export type RecommendedRecipePatch = CampaignRecipePatch & {
  recipeId: StrategyRecipeId;
};

/** Server response for strategy recipe surface (item 49b). */
export type StrategyRecipeSurface = {
  rankedRecipes: RankedRecipe[];
  selectedRecipeId: StrategyRecipeId;
  resolvedConfig: RecipeGenerationConfig;
  previewCredits: number;
  batchCredits: number;
  campaignPatch: CampaignRecipePatch;
  recommendedRecipe: RecommendedRecipePatch;
};
