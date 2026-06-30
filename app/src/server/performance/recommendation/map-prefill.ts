import {
  getStrategyRecipe,
  type RecipeCreativeLevel,
  type StrategyRecipeId,
} from "@/server/ai/strategy-recipes";
import { DERIVATION_FORMATS, type DerivationFormat } from "@/lib/derivation-display";
import type { SupportedVariableKey } from "../learning/types";
import type { NextExperimentPrefill } from "./types";

const RECIPE_VALUES = new Set<StrategyRecipeId>([
  "safe_iteration",
  "performance_push",
  "visual_differentiation",
]);

const GENERATION_MODE_TO_RECIPE: Record<string, StrategyRecipeId> = {
  art_variation: "performance_push",
  format_adaptation: "safe_iteration",
};

const STYLE_TO_CREATIVE: Record<string, RecipeCreativeLevel> = {
  soft: "conservative",
  medium: "balanced",
  strong: "bold",
};

function isDerivationFormat(value: string): value is DerivationFormat {
  return (DERIVATION_FORMATS as readonly string[]).includes(value);
}

function resolveRecipeId(variableKey: SupportedVariableKey, value: string): StrategyRecipeId {
  if (variableKey === "recipe") {
    if (RECIPE_VALUES.has(value as StrategyRecipeId)) {
      return value as StrategyRecipeId;
    }
    return GENERATION_MODE_TO_RECIPE[value] ?? "performance_push";
  }

  if (variableKey === "format") {
    return "safe_iteration";
  }

  if (variableKey === "style") {
    return value === "strong" ? "visual_differentiation" : "safe_iteration";
  }

  return "performance_push";
}

function resolveCreativeLevel(
  variableKey: SupportedVariableKey,
  value: string,
  recipeId: StrategyRecipeId
): RecipeCreativeLevel {
  if (variableKey === "style") {
    return STYLE_TO_CREATIVE[value] ?? getStrategyRecipe(recipeId).defaultConfig.creativeLevel;
  }

  return getStrategyRecipe(recipeId).defaultConfig.creativeLevel;
}

export function mapLearningToPrefill(input: {
  variableKey: SupportedVariableKey;
  variableValue: string;
  existingCtas?: string[];
}): NextExperimentPrefill {
  const recipeId = resolveRecipeId(input.variableKey, input.variableValue);
  const recipe = getStrategyRecipe(recipeId);
  const creativeLevel = resolveCreativeLevel(
    input.variableKey,
    input.variableValue,
    recipeId
  );

  if (input.variableKey === "format" && isDerivationFormat(input.variableValue)) {
    const existingCta = input.existingCtas?.find((cta) => cta.trim().length > 0)?.trim();
    return {
      recipeId,
      generationMode: "format_adaptation",
      creativeLevel,
      ctaVariants: existingCta ? [existingCta] : recipe.defaultConfig.ctaVariants.length
        ? recipe.defaultConfig.ctaVariants
        : ["Shop Now"],
      targetFormats: [input.variableValue],
    };
  }

  if (input.variableKey === "cta") {
    const extras = (input.existingCtas ?? [])
      .map((cta) => cta.trim())
      .filter((cta) => cta.length > 0 && cta !== input.variableValue)
      .slice(0, 2);

    return {
      recipeId,
      generationMode: "art_variation",
      creativeLevel,
      ctaVariants: [input.variableValue, ...extras],
    };
  }

  return {
    recipeId,
    generationMode: recipe.defaultConfig.generationMode,
    creativeLevel,
    ctaVariants:
      input.existingCtas?.map((cta) => cta.trim()).filter(Boolean).slice(0, 3) ??
      recipe.defaultConfig.ctaVariants,
    ...(recipe.defaultConfig.generationMode === "format_adaptation"
      ? { targetFormats: recipe.defaultConfig.targetFormats ?? ["1:1"] }
      : {}),
  };
}
