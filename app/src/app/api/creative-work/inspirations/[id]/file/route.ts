import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCuratedInspirationById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const inspiration = await getCuratedInspirationById(id);
    if (!inspiration) return apiError("assetNotFound", 404);

    return NextResponse.redirect(
      await objectStorage.signedDownloadUrl(inspiration.key),
      { status: 302 },
    );
  } catch (error) {
    return handleApiError(error, "creative-work.inspirations.file.GET");
  }
}
