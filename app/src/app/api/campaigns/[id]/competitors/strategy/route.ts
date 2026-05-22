import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getCompetitorAnalysesByCampaign } from "@/server/repositories/competitor-analysis";
import {
  generateDifferentiationStrategy,
  type CompetitorAnalysisResult,
} from "@/server/ai/competitor-analyzer";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const competitors = await getCompetitorAnalysesByCampaign(campaignId, workspace.id);
    if (competitors.length === 0) {
      return apiError("invalidInput", 400, { detail: "No competitor analyses found for this campaign" });
    }

    const competitorResults: CompetitorAnalysisResult[] = competitors
      .map((c) => {
        const analysis = c.analysis as Record<string, unknown> | null;
        if (!analysis) return null;

        const visualPatterns = analysis["visualPatterns"] as Record<string, unknown> | undefined;
        const messaging = analysis["messaging"] as Record<string, unknown> | undefined;

        // Normalize from DB storage format to expected format
        return {
          visualPatterns: {
            colors: Array.isArray(visualPatterns?.["colors"])
              ? visualPatterns["colors"]
              : undefined,
            composition: typeof visualPatterns?.["composition"] === "string"
              ? visualPatterns["composition"]
              : undefined,
            typography: typeof visualPatterns?.["typography"] === "string"
              ? visualPatterns["typography"]
              : undefined,
          },
          messaging: {
            headlineStyle: typeof messaging?.["headlineStyle"] === "string"
              ? messaging["headlineStyle"]
              : undefined,
            ctaStyle: typeof messaging?.["ctaStyle"] === "string"
              ? messaging["ctaStyle"]
              : undefined,
            offerType: typeof messaging?.["offerType"] === "string"
              ? messaging["offerType"]
              : undefined,
          },
          strengths: Array.isArray(c.strengths) ? c.strengths.filter((s): s is string => typeof s === "string") : [],
          weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses.filter((s): s is string => typeof s === "string") : [],
          differentiationOpportunities: Array.isArray(c.differentiators)
            ? c.differentiators.filter((s): s is string => typeof s === "string")
            : [],
        };
      })
      .filter(Boolean) as CompetitorAnalysisResult[];

    if (competitorResults.length === 0) {
      return apiError("invalidInput", 400, { detail: "No analyzed competitor data available" });
    }

    const strategy = await generateDifferentiationStrategy(
      {
        name: campaign.name,
        client: campaign.client,
        product: campaign.product,
        objective: campaign.objective,
        audience: campaign.audience,
        platforms: campaign.platforms,
        tone: campaign.tone,
        offer: campaign.offer,
        constraints: campaign.constraints,
        notes: campaign.notes,
      },
      competitorResults
    );

    return NextResponse.json({ strategy });
  } catch (error) {
    logger.error("[competitors/strategy] strategy generation failed", error);
    return handleApiError(error, "campaigns.[id].competitors.strategy.POST");
  }
}
