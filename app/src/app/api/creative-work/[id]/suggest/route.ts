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
    const directions = await suggestCreativeDirections({ workspaceId: workspace.id, workItemId: id });
    if (!directions) return apiError("creativeWorkNotFound", 404);
    return NextResponse.json({ directions }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].suggest.POST");
  }
}
