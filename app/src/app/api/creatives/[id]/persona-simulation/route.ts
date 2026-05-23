import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById } from "@/server/repositories/derivation";
import { getLandingPageById } from "@/server/repositories/landing-page";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createPersonaSimulation,
  getPersonaSimulationBySource,
  isCacheValid,
} from "@/server/repositories/persona-simulation";
import { simulatePersonas } from "@/server/ai/persona-simulator";

const postBodySchema = z.object({
  sourceType: z.enum(["derivation", "landing_page"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: creativeId } = await params;

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

    const simulation = await createPersonaSimulation(
      workspace.id,
      campaign.id,
      sourceType,
      creativeId,
      results
    );

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
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: creativeId } = await params;

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
