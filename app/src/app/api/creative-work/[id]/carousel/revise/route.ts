import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { carouselDeckPlanSchema } from "@/server/creative-work/carousel-contracts";
import {
  reviseCarouselDeck,
  toPublicCarouselSlide,
} from "@/server/application/revise-carousel";

const bodySchema = z.object({
  expectedRevision: z.string().min(1),
  revisionKey: z.string().uuid(),
  plan: carouselDeckPlanSchema,
  globalVisualInstruction: z.string().trim().min(1).max(2000).nullable(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace, user }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }
    const result = await reviseCarouselDeck({
      ...parsed.data,
      workspaceId: workspace.id,
      workItemId: id,
      userId: user.id,
    });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found": return apiError("creativeWorkNotFound", 404);
        case "work_not_carousel": return apiError("creativeWorkNotCarousel", 409);
        case "stale_input": return apiError("stale_input", 409, result.error.details);
        case "revision_conflict": return apiError("carouselDeckRevisionConflict", 409, result.error.details);
        case "generation_in_flight": return apiError("carouselDeckGenerationInFlight", 409);
        case "invalid_plan": return apiError("carouselDeckPlanInvalid", 422, result.error.details);
        case "invalid_context": return apiError("invalid_context", 422, result.error.details);
        case "provider_base_missing": return apiError("carouselProviderBaseMissing", 409, result.error.details);
        case "composition_failed": return apiError("carouselCompositionFailed", 422, result.error.details);
        case "dispatch_failed": return apiError("creativeWorkDispatchUnavailable", 502, result.error.details);
      }
    }
    return NextResponse.json({
      work: result.value.work,
      slides: result.value.slides.map(toPublicCarouselSlide),
      deckRevision: result.value.deckRevision,
      replay: result.value.replay,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.carousel.revise.POST");
  }
}
