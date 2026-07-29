import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { cancelCreativeWorkOutput } from "@/server/application/cancel-creative-work-output";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> },
) {
  try {
    const [{ user, workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const result = await cancelCreativeWorkOutput({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
      userId: user.id,
    });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "output_not_found":
          return apiError("creativeWorkOutputNotFound", 404);
        case "output_not_cancellable":
          return apiError("creativeWorkOutputNotCancellable", 409, { status: result.error.status });
      }
    }
    return NextResponse.json({ output: result.value.output, canceled: true, refunded: result.value.refunded });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].cancel.POST");
  }
}
