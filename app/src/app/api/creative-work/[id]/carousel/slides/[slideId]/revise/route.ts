import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  reviseCarouselSlide,
  toPublicCarouselSlide,
} from "@/server/application/revise-carousel";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("copy"),
    expectedVersion: z.number().int().positive(),
    revisionKey: z.string().uuid(),
    primaryText: z.string().trim().min(1),
    secondaryText: z.string().trim().min(1).nullable(),
  }).strict(),
  z.object({
    kind: z.literal("visual"),
    expectedVersion: z.number().int().positive(),
    revisionKey: z.string().uuid(),
    instruction: z.string().trim().min(1).max(2000),
  }).strict(),
  z.object({
    kind: z.literal("retry"),
    expectedVersion: z.number().int().positive(),
    revisionKey: z.string().uuid(),
  }).strict(),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> },
) {
  try {
    const [{ workspace, user }, { id, slideId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }
    const result = await reviseCarouselSlide({
      ...parsed.data,
      workspaceId: workspace.id,
      workItemId: id,
      slideId,
      userId: user.id,
    });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found": return apiError("creativeWorkNotFound", 404);
        case "slide_not_found": return apiError("carouselSlideNotFound", 404);
        case "work_not_carousel": return apiError("creativeWorkNotCarousel", 409);
        case "stale_input": return apiError("stale_input", 409);
        case "slide_version_conflict": return apiError("carouselSlideVersionConflict", 409, result.error.details);
        case "slide_not_completed": return apiError("carouselSlideNotCompleted", 409, result.error.details);
        case "slide_not_failed": return apiError("carouselSlideNotFailed", 409, result.error.details);
        case "provider_base_missing": return apiError("carouselProviderBaseMissing", 409, result.error.details);
        case "invalid_context": return apiError("invalid_context", 422, result.error.details);
        case "composition_failed": return apiError("carouselCompositionFailed", 422, result.error.details);
        case "generation_in_flight": return apiError("carouselDeckGenerationInFlight", 409);
        case "dispatch_failed": return apiError("creativeWorkDispatchUnavailable", 502, result.error.details);
      }
    }
    return NextResponse.json(
      {
        slide: toPublicCarouselSlide(result.value.slide),
        slides: result.value.slides.map(toPublicCarouselSlide),
        replay: result.value.replay,
      },
      { status: result.value.replay || parsed.data.kind === "copy" ? 200 : 202 },
    );
  } catch (error) {
    return handleApiError(error, "creative-work.carousel.slide-revise.POST");
  }
}
