import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignById,
  updateCampaign,
  claimCreativeDiagnosisAnalysis,
} from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";
import { analyzeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";
import { spendCreditsOrApiError } from "@/server/billing/gates";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const campaign = await getCampaignById(id, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    if (campaign.generationMode !== "art_variation") {
      return apiError("diagnosisOnlyForArtVariation", 400);
    }

    const claim = await claimCreativeDiagnosisAnalysis(id, workspace.id);
    if (claim === "not_found") {
      return apiError("campaignNotFound", 404);
    }
    if (claim === "in_progress") {
      return apiError("diagnosisInProgress", 429);
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "creative_qa",
      amount: 1,
      idempotencyKey: `diagnosis-regenerate:${id}`,
      metadata: { campaignId: id },
    });
    if (creditError) {
      await updateCampaign(id, workspace.id, {
        creativeDiagnosisStatus: "failed",
      });
      return creditError;
    }

    const assets = await getAssetsByCampaign(id, workspace.id);
    const asset = assets[0];

    if (!asset) {
      await updateCampaign(id, workspace.id, {
        creativeDiagnosisStatus: "failed",
      });
      return apiError("noAssetForDiagnosis", 400);
    }

    try {
      const imageBuffer = await objectStorage.get(asset.key);
      const result = await analyzeCreativeDiagnosis({
        campaign: {
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
          ctaVariants: campaign.ctaVariants,
        },
        imageBuffer,
        mimeType: asset.type || "image/png",
        locale: request.headers.get("accept-language")?.includes("pt") ? "pt-BR" : "en",
      });

      await updateCampaign(id, workspace.id, {
        creativeDiagnosisStatus: result.status,
        creativeDiagnosis: result.diagnosis,
        creativeDiagnosisSource: "regenerated",
        creativeDiagnosisUpdatedAt: new Date(),
      });

      return NextResponse.json({ diagnosis: result.diagnosis, source: "regenerated" });
    } catch (error) {
      logger.warn("[diagnosis.regenerate.POST] analysis failed", error);
      await updateCampaign(id, workspace.id, {
        creativeDiagnosisStatus: "failed",
      });
      return apiError("diagnosisFailed", 500);
    }
  } catch (error) {
    return handleApiError(error, "campaigns.[id].diagnosis.regenerate.POST");
  }
}
