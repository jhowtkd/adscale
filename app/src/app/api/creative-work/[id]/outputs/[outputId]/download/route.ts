import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";

/**
 * Return a short-lived signed download URL for a completed output. Scoped by
 * workspace + work item + output ID so a foreign workspace can never obtain a
 * URL for someone else's output.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> }
) {
  try {
    const [{ workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    const output = existing.outputs.find((o) => o.id === outputId);
    if (!output) {
      return apiError("creativeWorkOutputNotFound", 404);
    }

    if (output.status !== "completed" || !output.outputKey) {
      return apiError("creativeWorkOutputNotReady", 409, {
        status: output.status,
      });
    }

    const url = await objectStorage.signedDownloadUrl(output.outputKey);
    return NextResponse.json({ url });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].download.GET");
  }
}