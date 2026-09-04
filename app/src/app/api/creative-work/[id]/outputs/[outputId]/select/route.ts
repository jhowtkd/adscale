import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { selectCreativeWorkOutputCommand } from "@/server/application/select-creative-work-output";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const selectOutputSchema = z
  .object({
    saveToLibrary: z.boolean().default(true),
    confirmObjective: z.boolean().default(false),
  })
  .default({ saveToLibrary: true, confirmObjective: false });

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
        case "objective_selection_blocked":
          return apiError("creativeWorkOutputObjectiveFailed", 409, result.error.policy);
        case "objective_confirmation_required":
          return apiError("creativeWorkOutputConfirmationRequired", 409, result.error.policy);
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({ output: result.value.output });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].select.POST");
  }
}
