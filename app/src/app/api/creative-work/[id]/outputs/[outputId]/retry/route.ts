import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { retryCreativeWorkOutput } from "@/server/application/retry-creative-work-output";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

/**
 * Free retry of a failed output — HTTP adapter only (Phase 5 / item 38).
 * Domain: retryCreativeWorkOutput (no billing).
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

    const result = await retryCreativeWorkOutput({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "output_not_found":
          return apiError("creativeWorkOutputNotFound", 404);
        case "output_not_retriable":
          return apiError("creativeWorkOutputNotRetriable", 409, {
            status: result.error.status,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({ output: result.value.output });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].retry.POST");
  }
}
