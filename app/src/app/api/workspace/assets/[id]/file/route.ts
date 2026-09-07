import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { objectDownloadResponse } from "@/server/storage/download-response";

function syntheticVisualFixture(asset: { key: string; width: number | null; height: number | null }) {
  if (
    process.env.VISUAL_FOUNDATIONS_SKIP_STORAGE !== "true" ||
    !asset.key.startsWith("e2e/visual-foundations/") ||
    !asset.width ||
    !asset.height
  ) {
    return null;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}"><rect width="100%" height="100%" fill="#172018"/></svg>`;
  return new NextResponse(svg, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/svg+xml",
    },
  });
}

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

    const syntheticFixture = syntheticVisualFixture(asset);
    if (syntheticFixture) return syntheticFixture;

    const url = await objectStorage.signedDownloadUrl(asset.key);
    const wantsJson =
      new URL(request.url).searchParams.get("format") === "json" ||
      request.headers.get("accept")?.includes("application/json");

    if (wantsJson) {
      return NextResponse.json({ url });
    }
    return objectDownloadResponse(url, asset.key);
  } catch (error) {
    return handleApiError(error, "workspace.assets.[id].file.GET");
  }
}
