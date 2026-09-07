import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { listCurrentCarouselSlides } from "@/server/repositories/creative-work-carousel";
import { objectStorage } from "@/server/storage";
import { objectDownloadResponse } from "@/server/storage/download-response";

/**
 * Resolves a short-lived signed URL for one current completed carousel slide
 * of the authenticated workspace. Everything else (drafts, in-flight or
 * failed slides, foreign workspaces) is refused before any URL is issued.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> },
) {
  try {
    const [{ workspace }, { id, slideId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const aggregate = await getCreativeWork(workspace.id, id);
    if (!aggregate) return apiError("creativeWorkNotFound", 404);
    if (aggregate.work.toolKind !== "carousel") {
      return apiError("creativeWorkNotCarousel", 409);
    }
    const slides = await listCurrentCarouselSlides(workspace.id, id);
    const slide = slides.find((row) => row.id === slideId);
    if (!slide) return apiError("carouselSlideNotFound", 404);
    if (slide.status !== "completed" || !slide.outputKey) {
      return apiError("carouselSlideNotCompleted", 409, { status: slide.status });
    }
    const url = await objectStorage.signedDownloadUrl(slide.outputKey);
    return objectDownloadResponse(url, slide.outputKey);
  } catch (error) {
    return handleApiError(error, "creative-work.carousel.slide-download.GET");
  }
}
