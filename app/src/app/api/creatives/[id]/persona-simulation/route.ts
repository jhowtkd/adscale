import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById } from "@/server/repositories/derivation";
import { getLandingPageById } from "@/server/repositories/landing-page";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createPersonaSimulation,
  getPersonaSimulationBySource,
  isCacheValid,
  updatePersonaSimulation,
} from "@/server/repositories/persona-simulation";
import { simulatePersonas } from "@/server/ai/persona-simulator";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

const postBodySchema = z.object({
  sourceType: z.enum(["derivation", "landing_page"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: creativeId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(new URL(request.url).pathname, request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.format());
    }

    const { sourceType } = parsed.data;
    let campaignId: string;
    let creativeDescription: string;

    if (sourceType === "derivation") {
      const derivation = await getDerivationById(creativeId, workspace.id);
      if (!derivation) {
        return apiError("derivationNotFound", 404);
      }
      if (derivation.status !== "approved") {
        return apiError("derivationNotApproved", 409);
      }
      if (!derivation.outputKey) {
        return apiError("derivationMissingOutput", 400);
      }
      campaignId = derivation.campaignId;
      creativeDescription = derivation.prompt ?? "";
    } else {
      const landingPage = await getLandingPageById(creativeId, workspace.id);
      if (!landingPage) {
        return apiError("landingPageNotFound", 404);
      }
      if (landingPage.status !== "completed") {
        return apiError("landingPageNotCompleted", 409);
      }
      if (!landingPage.htmlKey) {
        return apiError("landingPageMissingHtml", 400);
      }
      campaignId = landingPage.campaignId;
      creativeDescription = landingPage.title ?? "";
    }

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const cached = await getPersonaSimulationBySource(
      workspace.id,
      sourceType,
      creativeId
    );

    if (cached && isCacheValid(cached)) {
      return NextResponse.json({
        simulation: cached,
        results: cached.results,
        cached: true,
      });
    }

    const results = await simulatePersonas({
      campaign: {
        objective: campaign.objective ?? "",
        audience: campaign.audience ?? "",
        offer: campaign.offer ?? "",
        ctaText: campaign.ctaVariants?.[0] ?? null,
        tone: campaign.tone ?? null,
        constraints: campaign.constraints ?? null,
        clientName: campaign.client ?? null,
        productName: campaign.product ?? null,
      },
      creative: {
        type: sourceType,
        description: creativeDescription,
      },
      locale: "pt-BR",
    });

    const simulation = cached
      ? await updatePersonaSimulation(cached.id, results)
      : await createPersonaSimulation(
          workspace.id,
          campaign.id,
          sourceType,
          creativeId,
          results
        );

    await recordBrandMemoryEvent({
      type: "persona_test_completed",
      workspaceId: workspace.id,
      clientProfileId: campaign.clientProfileId,
      campaignId: campaign.id,
      derivationId: sourceType === "derivation" ? creativeId : null,
      occurredAt: simulation.createdAt,
      summary: `Persona test completed for ${sourceType} in campaign "${campaign.name}".`,
      payload: {
        sourceType,
        sourceId: creativeId,
        campaign: {
          name: campaign.name,
          client: campaign.client,
          product: campaign.product,
          objective: campaign.objective,
          audience: campaign.audience,
          offer: campaign.offer,
          tone: campaign.tone,
          constraints: campaign.constraints,
          ctaVariants: campaign.ctaVariants,
        },
        results,
      },
    });

    return NextResponse.json({
      simulation,
      results,
      cached: false,
    });
  } catch (error) {
    return handleApiError(error, "creatives.persona-simulation.POST");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: creativeId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get("sourceType");
    if (!sourceType || (sourceType !== "derivation" && sourceType !== "landing_page")) {
      return apiError("invalidSourceType", 400);
    }

    const simulation = await getPersonaSimulationBySource(
      workspace.id,
      sourceType,
      creativeId
    );

    if (!simulation) {
      return apiError("notFound", 404);
    }

    return NextResponse.json({
      simulation,
      results: simulation.results,
      stale: !isCacheValid(simulation),
    });
  } catch (error) {
    return handleApiError(error, "creatives.persona-simulation.GET");
  }
}
