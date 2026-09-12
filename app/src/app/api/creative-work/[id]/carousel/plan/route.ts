import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { planCarouselWork } from "@/server/application/plan-carousel-work";
import { carouselEditorialCommandSchema } from "@/server/creative-work/carousel-editorial-state";

const bodySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  answers: z.record(z.string().min(1), z.string().trim().min(1).max(1_000)).default({}),
  command: carouselEditorialCommandSchema.optional(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await planCarouselWork({
      workspaceId: workspace.id,
      workItemId: id,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      answers: parsed.data.answers,
      ...(parsed.data.command ? { command: parsed.data.command } : {}),
    });
    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found": return apiError("creativeWorkNotFound", 404);
        case "work_not_carousel": return apiError("creativeWorkNotCarousel", 409, result.error.details);
        case "work_not_draft": return apiError("creativeWorkNotDraft", 409, result.error.details);
        case "sources_not_ready": return apiError("creativeWorkSourcesNotReady", 409);
        case "stale_input": return apiError("stale_input", 409);
        case "editorial_plan_invalid": return apiError("editorial_plan_invalid", 422);
        case "research_unavailable": return apiError("research_unavailable", 422, result.error.details);
        case "research_insufficient": return apiError("research_insufficient", 422, result.error.details);
        case "invalid_editorial_transition": return apiError("invalid_editorial_transition", 409, result.error.details);
        // Uma preparacao equivalente ja esta em curso: o consumidor acompanha
        // aquela em vez de disparar outra chamada ao provedor. A Task 17
        // formaliza este estado nas demais rotas.
        case "preparation_in_progress": return apiError("preparation_in_progress", 409, result.error.details);
      }
    }
    return NextResponse.json({
      work: result.value.work,
      draft: result.value.draft,
      findings: result.value.findings,
      editorial: result.value.editorial,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].carousel.plan.POST");
  }
}
