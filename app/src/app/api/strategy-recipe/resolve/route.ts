import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { STRATEGY_RECIPE_IDS } from "@/lib/domain/strategy-recipe-types";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { resolveStrategyRecipeSurface } from "@/server/application/resolve-strategy-recipe-surface";

const recipeIdSchema = z.enum(STRATEGY_RECIPE_IDS);

const bodySchema = z.object({
  context: z
    .object({
      readiness: z
        .object({
          status: z.string().optional(),
          overallScore: z.number().optional(),
          canGenerate: z.boolean().optional(),
          dimensions: z
            .array(z.object({ id: z.string(), score: z.number() }))
            .optional(),
        })
        .nullable()
        .optional(),
      brandKit: z
        .object({
          constraints: z.string().nullable().optional(),
          toneOfVoice: z.string().nullable().optional(),
          prohibitedElements: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      campaign: z
        .object({
          ctaVariants: z.array(z.string()).nullable().optional(),
          targetFormats: z.array(z.string()).nullable().optional(),
          platforms: z.array(z.string()).nullable().optional(),
          generationMode: z.string().nullable().optional(),
          creativeLevel: z.string().nullable().optional(),
          suggestedCta: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .default({}),
  selectedRecipeId: recipeIdSchema.nullable().optional(),
  overrides: z
    .object({
      generationMode: z.enum(["art_variation", "format_adaptation"]).optional(),
      creativeLevel: z
        .enum(["conservative", "balanced", "bold", "extreme"])
        .optional(),
      ctaVariants: z.array(z.string()).optional(),
      targetFormats: z.array(z.string()).optional(),
      preservationEmphasis: z.enum(["high", "medium", "low"]).optional(),
      styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
    })
    .optional(),
  recommendedPrefill: z
    .object({
      recipeId: recipeIdSchema.optional(),
      config: z.record(z.unknown()).optional(),
    })
    .nullable()
    .optional(),
});

/**
 * Phase 6 / item 49b: strategy recipe domain surface for client UI.
 * Ranking, credits, and campaign patch are server-derived only.
 */
export async function POST(request: Request) {
  try {
    await requireWorkspaceAccess(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const surface = resolveStrategyRecipeSurface({
      context: parsed.data.context,
      selectedRecipeId: parsed.data.selectedRecipeId,
      overrides: parsed.data.overrides,
      recommendedPrefill: parsed.data.recommendedPrefill as never,
    });

    return NextResponse.json(surface);
  } catch (error) {
    return handleApiError(error, "strategy-recipe.resolve.POST");
  }
}
