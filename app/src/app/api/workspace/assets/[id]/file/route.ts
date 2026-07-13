import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

/**
 * Authenticated file access for library assets (upload + creative_work).
 * Mirrors creative-work output download: 302 to a short-lived signed URL so
 * private R2 keys work in <img src> without relying on R2_PUBLIC_BASE_URL.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const asset = await getWorkspaceAssetById(id, workspace.id);
    if (!asset) {
      return apiError("assetNotFound", 404);
    }

    const url = await objectStorage.signedDownloadUrl(asset.key);
    const wantsJson =
      new URL(request.url).searchParams.get("format") === "json" ||
      request.headers.get("accept")?.includes("application/json");

    if (wantsJson) {
      return NextResponse.json({ url });
    }
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    return handleApiError(error, "workspace.assets.[id].file.GET");
  }
}
