import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { suggestCreativeDirections } from "@/server/application/suggest-creative-directions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;
    const result = await suggestCreativeDirections({ workspaceId: workspace.id, workItemId: id });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "work_not_draft":
          return apiError("creativeWorkNotDraft", 409, { status: result.error.status });
        case "intent_not_supported":
        case "source_not_ready":
          return apiError("creativeWorkNotEligibleForSuggestion", 409);
        default:
          return apiError("invalidRequest", 400);
      }
    }
    return NextResponse.json({ directions: result.directions }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].suggest.POST");
  }
}
