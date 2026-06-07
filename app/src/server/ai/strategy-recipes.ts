import type { CreativeReadinessResult, ReadinessDimensionId } from "./creative-readiness";

/** Keep in sync with `CREDIT_COSTS.image_derivation` in server/billing/credits.ts */
export const IMAGE_DERIVATION_CREDIT_COST = 5;

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

export interface RecipeSuggestionContext {
  readiness?: CreativeReadinessResult | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
}

export interface RankedRecipe {
  id: StrategyRecipeId;
  score: number;
  recommended: boolean;
}

const DEFAULT_CTAS = ["Shop Now", "Learn More"];

const RECIPE_CATALOG: Record<StrategyRecipeId, StrategyRecipeDefinition> = {
  safe_iteration: {
    id: "safe_iteration",
    defaultConfig: {
      generationMode: "art_variation",
      creativeLevel: "conservative",
      ctaVariants: [],
      preservationEmphasis: "high",
    },
  },
  performance_push: {
    id: "performance_push",
    defaultConfig: {
      generationMode: "art_variation",
      creativeLevel: "bold",
      ctaVariants: [],
      preservationEmphasis: "medium",
    },
  },
  visual_differentiation: {
    id: "visual_differentiation",
    defaultConfig: {
      generationMode: "art_variation",
      creativeLevel: "extreme",
      ctaVariants: [],
      preservationEmphasis: "low",
    },
  },
};

export function getStrategyRecipeCatalog(): StrategyRecipeDefinition[] {
  return STRATEGY_RECIPE_IDS.map((id) => RECIPE_CATALOG[id]);
}

export function getStrategyRecipe(id: StrategyRecipeId): StrategyRecipeDefinition {
  return RECIPE_CATALOG[id];
}

function resolveCtaVariants(
  recipe: StrategyRecipeDefinition,
  campaign?: CampaignRecipeContext | null
): string[] {
  const existing = (campaign?.ctaVariants ?? [])
    .map((cta) => cta.trim())
    .filter((cta) => cta.length > 0);

  if (existing.length > 0) {
    if (recipe.id === "performance_push") {
      return existing.slice(0, 3);
    }
    if (recipe.id === "visual_differentiation") {
      return existing.slice(0, 2);
    }
    return [existing[0]];
  }

  const suggested = campaign?.suggestedCta?.trim();
  if (suggested) {
    if (recipe.id === "performance_push") {
      return [suggested, DEFAULT_CTAS[1]];
    }
    return [suggested];
  }

  if (recipe.id === "performance_push") {
    return [...DEFAULT_CTAS];
  }
  return [DEFAULT_CTAS[0]];
}

export function mapRecipeToGenerationConfig(
  recipeId: StrategyRecipeId,
  context?: RecipeSuggestionContext,
  overrides?: Partial<RecipeGenerationConfig>
): RecipeGenerationConfig {
  const recipe = getStrategyRecipe(recipeId);
  const base: RecipeGenerationConfig = {
    ...recipe.defaultConfig,
    ctaVariants: resolveCtaVariants(recipe, context?.campaign),
    targetFormats: context?.campaign?.targetFormats?.length
      ? context.campaign.targetFormats
      : ["1:1", "4:5", "9:16"],
  };

  if (overrides?.generationMode === "format_adaptation") {
    base.generationMode = "format_adaptation";
    base.targetFormats =
      overrides.targetFormats?.length
        ? overrides.targetFormats
        : base.targetFormats;
    base.ctaVariants =
      overrides.ctaVariants?.length
        ? overrides.ctaVariants
        : base.ctaVariants.slice(0, 1);
  }

  return {
    ...base,
    ...overrides,
    ctaVariants:
      overrides?.ctaVariants?.length
        ? overrides.ctaVariants.map((c) => c.trim()).filter(Boolean)
        : base.ctaVariants,
    targetFormats: overrides?.targetFormats ?? base.targetFormats,
  };
}

function dimensionScore(
  readiness: CreativeReadinessResult | null | undefined,
  id: ReadinessDimensionId
): number {
  return readiness?.dimensions.find((d) => d.id === id)?.score ?? 70;
}

function scoreRecipe(
  recipeId: StrategyRecipeId,
  context: RecipeSuggestionContext
): number {
  const readiness = context.readiness;
  const brandKit = context.brandKit;
  let score = 50;

  const ctaScore = dimensionScore(readiness, "ctaProminence");
  const platformScore = dimensionScore(readiness, "platformFit");
  const brandScore = dimensionScore(readiness, "brandFit");
  const legibilityScore = dimensionScore(readiness, "textLegibility");
  const overall = readiness?.overallScore ?? 70;
  const status = readiness?.status ?? "ready";

  if (recipeId === "safe_iteration") {
    score += status === "blocked" ? 40 : 0;
    score += overall < 70 ? 25 : 0;
    score += brandScore < 60 ? 20 : 0;
    score += legibilityScore < 60 ? 15 : 0;
    if (brandKit?.constraints?.trim()) score += 10;
  }

  if (recipeId === "performance_push") {
    score += ctaScore < 65 ? 35 : 0;
    score += dimensionScore(readiness, "offerClarity") < 65 ? 15 : 0;
    score += status === "needs_attention" ? 20 : 0;
  }

  if (recipeId === "visual_differentiation") {
    score += platformScore < 65 ? 30 : 0;
    score += dimensionScore(readiness, "visualHierarchy") < 60 ? 20 : 0;
    score += overall >= 70 ? 15 : 0;
    if (brandKit?.prohibitedElements?.trim()) score -= 15;
  }

  return score;
}

export function rankRecipesForContext(
  context: RecipeSuggestionContext
): RankedRecipe[] {
  const ranked = STRATEGY_RECIPE_IDS.map((id) => ({
    id,
    score: scoreRecipe(id, context),
    recommended: false,
  })).sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    ranked[0] = { ...ranked[0], recommended: true };
  }

  return ranked;
}

export function countDerivationJobs(config: RecipeGenerationConfig): number {
  if (config.generationMode === "format_adaptation") {
    const formats = config.targetFormats ?? [];
    return formats.length > 0 ? formats.length : 0;
  }

  const ctas = config.ctaVariants.map((c) => c.trim()).filter(Boolean);
  return ctas.length;
}

export interface BatchCreditBreakdown {
  jobCount: number;
  unitCost: number;
  totalCredits: number;
  generationMode: RecipeGenerationConfig["generationMode"];
}

export function getBatchCreditBreakdown(
  config: RecipeGenerationConfig
): BatchCreditBreakdown {
  const jobCount = countDerivationJobs(config);
  const unitCost = IMAGE_DERIVATION_CREDIT_COST;
  return {
    jobCount,
    unitCost,
    totalCredits: jobCount * unitCost,
    generationMode: config.generationMode,
  };
}

export function estimateCreditCost(
  config: RecipeGenerationConfig,
  options?: { preview?: boolean }
): number {
  if (options?.preview) {
    return IMAGE_DERIVATION_CREDIT_COST;
  }
  return getBatchCreditBreakdown(config).totalCredits;
}

export function toCampaignPatch(config: RecipeGenerationConfig): {
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: RecipeCreativeLevel;
  ctaVariants: string[];
  targetFormats?: string[];
} {
  return {
    generationMode: config.generationMode,
    creativeLevel: config.creativeLevel,
    ctaVariants: config.ctaVariants,
    ...(config.generationMode === "format_adaptation" && config.targetFormats
      ? { targetFormats: config.targetFormats }
      : {}),
  };
}
