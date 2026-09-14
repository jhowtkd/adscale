import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import {
  reviewCreativeWorkPersonFidelity,
  selectCreativeWorkOutputCommand,
} from "@/server/application/select-creative-work-output";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const selectOutputSchema = z
  .object({
    saveToLibrary: z.boolean().default(true),
    confirmObjective: z.boolean().default(false),
    saveAsRecipe: z.boolean().default(false),
  })
  .default({ saveToLibrary: true, confirmObjective: false, saveAsRecipe: false });

/**
 * Select a completed output as the winner — HTTP adapter only (Phase 5 / item 38).
 * Domain: selectCreativeWorkOutputCommand.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> }
) {
  try {
    const [{ workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = selectOutputSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
      saveToLibrary: parsed.data.saveToLibrary,
      confirmObjective: parsed.data.confirmObjective,
      saveAsRecipe: parsed.data.saveAsRecipe,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "output_not_found":
          return apiError("creativeWorkOutputNotFound", 404);
        case "output_not_selectable":
          return apiError("creativeWorkOutputNotSelectable", 409, {
            status: result.error.status,
          });
        case "output_missing_key":
          return apiError("creativeWorkOutputMissingKey", 409);
        case "calibration_managed":
          return apiError("creativeWorkCalibrationManaged", 403);
        case "objective_selection_blocked":
          return apiError("creativeWorkOutputObjectiveFailed", 409, result.error.policy);
        case "objective_confirmation_required":
          return apiError("creativeWorkOutputConfirmationRequired", 409, result.error.policy);
        case "visual_recipe_not_structured":
          return apiError("visualRecipeNotStructured", 409, { reason: result.error.reason });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({
      output: result.value.output,
      recipe: result.value.recipe ?? null,
      effects: result.value.effects,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].select.POST");
  }
}

const reviewPersonFidelitySchema = z
  .object({
    action: z.literal("review_person_fidelity"),
    outputId: z.string().uuid(),
    referenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    accepted: z.boolean(),
  })
  .strict();

/**
 * Record the specific human review of a person-fidelity assessment
 * (plan 03, T3) — HTTP adapter only. Registers the review WITHOUT executing
 * selection or its library/revenue effects.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> },
) {
  try {
    const [{ user, workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = reviewPersonFidelitySchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success || parsed.data.outputId !== outputId) {
      return apiError(
        "invalidInput",
        400,
        parsed.success ? undefined : parsed.error.flatten(),
      );
    }

    const result = await reviewCreativeWorkPersonFidelity({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
      userId: user.id,
      referenceHash: parsed.data.referenceHash,
      accepted: parsed.data.accepted,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "output_not_found":
          return apiError("creativeWorkOutputNotFound", 404);
        case "no_person_fidelity":
          return apiError("creativeWorkOutputNotSelectable", 409, {
            reason: "no_person_fidelity",
          });
        case "stale_reference":
          return apiError("creativeWorkOutputNotSelectable", 409, {
            reason: "stale_person_reference",
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({ output: result.value.output });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].select.PATCH");
  }
}
