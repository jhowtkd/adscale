import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { resolveCreativeWorkOutputDownload } from "@/server/application/resolve-creative-work-output-download";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

/**
 * Signed download URL for a completed output — HTTP adapter only (Phase 5 / item 38).
 * Domain: resolveCreativeWorkOutputDownload.
 *
 * Default: 302 redirect for browsers / <img src>. Opt into JSON with
 * `?format=json` or `Accept: application/json`.
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

    const result = await resolveCreativeWorkOutputDownload({
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
        case "output_not_ready":
          return apiError("creativeWorkOutputNotReady", 409, {
            status: result.error.status,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    const { url } = result.value;
    const url2 = new URL(request.url);
    const wantsJson =
      url2.searchParams.get("format") === "json" ||
      request.headers.get("accept")?.includes("application/json");
    if (wantsJson) {
      return NextResponse.json({ url });
    }
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].download.GET");
  }
}
