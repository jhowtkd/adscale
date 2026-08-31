import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { exportCarouselWork } from "@/server/application/export-carousel-work";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const result = await exportCarouselWork({ workspaceId: workspace.id, workItemId: id });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found": return apiError("creativeWorkNotFound", 404);
        case "work_not_carousel": return apiError("creativeWorkNotCarousel", 409);
        case "stale_input": return apiError("stale_input", 409);
        case "deck_not_approved": return apiError("carouselDeckNotApproved", 409, result.error.details);
        case "deck_not_ready": return apiError("carouselDeckNotReady", 409, result.error.details);
        case "export_failed": return apiError("carouselExportFailed", 500, result.error.details);
      }
    }
    return new NextResponse(Readable.toWeb(result.value.stream as Readable) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="carousel-${id}.zip"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "creative-work.carousel.export.GET");
  }
}
