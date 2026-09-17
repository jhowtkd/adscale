import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { resolveCreativeWorkOutputDownload, type CreativeWorkOutputDownloadFormat } from "@/server/application/resolve-creative-work-output-download";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { traceExportServed } from "@/server/diagnostics/selection-export-tracing";
import { getLayerEditorAccess } from "@/server/layer-editor/quota";
import { objectDownloadResponse } from "@/server/storage/download-response";

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
    const [{ user, workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const query = new URL(request.url).searchParams;
    const requestedFormat = query.get("format");
    const rawFormat = requestedFormat === "json" ? "original" : requestedFormat ?? "original";
    if (!["original", "psd", "zip", "layer", "layer-candidate", "draft-png", "draft-psd"].includes(rawFormat)) {
      return apiError("invalidRequest", 400);
    }
    const format = rawFormat as CreativeWorkOutputDownloadFormat;
    if (format === "zip") await requirePlatformOwner(request);
    if (format !== "original" && format !== "zip") {
      const access = await getLayerEditorAccess(workspace.id, new Date());
      if (!access.enabled) return apiError("layer_editor_not_available", 403);
    }
    const layerId = query.get("layerId");
    const rawRevision = query.get("revision");
    const revision = rawRevision ? Number(rawRevision) : undefined;
    if ((format === "layer" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(layerId ?? "")) || (rawRevision !== null && (!Number.isInteger(revision) || revision! <= 0))) return apiError("invalidRequest", 400);

    const result = await resolveCreativeWorkOutputDownload({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
      actorUserId: user.id,
      ...(format !== "original" ? { format } : {}),
      ...(layerId ? { layerId } : {}),
      ...(revision ? { revision } : {}),
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

    const { url, traceContext } = result.value;
    const url2 = new URL(request.url);
    const wantsJson =
      url2.searchParams.get("format") === "json" ||
      request.headers.get("accept")?.includes("application/json");
    if (wantsJson) {
      const response = NextResponse.json({ url });
      // trace-390: served lands on the same operation as prepared (Peça única
      // only — untraced downloads skip silently). Journaling never throws.
      if (traceContext) {
        traceExportServed({ context: traceContext, servedAs: "json" });
      }
      return response;
    }
    const response = await objectDownloadResponse(url, result.value.outputKey);
    if (traceContext) {
      traceExportServed({
        context: traceContext,
        servedAs: url.startsWith("e2e-storage://") ? "bytes" : "redirect",
      });
    }
    return response;
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].download.GET");
  }
}
