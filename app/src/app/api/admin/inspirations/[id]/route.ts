import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  deleteWorkspaceAsset,
  getCuratedInspirationById,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [, { id }] = await Promise.all([
      requirePlatformOwner(request),
      params,
    ]);
    const inspiration = await getCuratedInspirationById(id);
    if (!inspiration) return apiError("assetNotFound", 404);

    try {
      await objectStorage.delete(inspiration.key);
    } catch (error) {
      logger.warn("[admin-inspiration] object delete failed", { id, error });
    }
    await deleteWorkspaceAsset(id, inspiration.workspaceId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "admin.inspirations.DELETE");
  }
}
