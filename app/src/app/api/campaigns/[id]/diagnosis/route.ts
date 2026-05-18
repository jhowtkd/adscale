import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { downloadBuffer } from "@/server/storage/r2";
import {
  analyzeCreativeDiagnosis,
  normalizeCreativeDiagnosis,
} from "@/server/ai/creative-diagnosis";

const updateDiagnosisSchema = z.object({
  diagnosis: z.object({
    detectedConcept: z.string(),
    elementsToPreserve: z.array(z.string()),
    variationOpportunities: z.array(z.string()),
  }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;

    const campaign = await getCampaignById(id, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    if (campaign.generationMode !== "art_variation") {
      return apiError("diagnosisOnlyForArtVariation", 400);
    }
    if (campaign.creativeDiagnosisStatus === "analyzing") {
      return apiError("diagnosisInProgress", 429);
    }
    if (campaign.creativeDiagnosisStatus === "ready" && campaign.creativeDiagnosis) {
      return NextResponse.json({
        diagnosis: campaign.creativeDiagnosis,
        source: campaign.creativeDiagnosisSource ?? "cached",
        cached: true,
      });
    }

    // Mark as analyzing
    await updateCampaign(id, workspace.id, {
      creativeDiagnosisStatus: "analyzing",
    });

    const assets = await getAssetsByCampaign(id, workspace.id);
    const asset = assets[0];

    if (!asset) {
      await updateCampaign(id, workspace.id, {
        creativeDiagnosisStatus: "failed",
      });
      return apiError("noAssetForDiagnosis", 400);
    }

    try {
      const imageBuffer = await downloadBuffer(asset.key);
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
        creativeDiagnosisSource: result.source,
        creativeDiagnosisUpdatedAt: new Date(),
      });

      return NextResponse.json({ diagnosis: result.diagnosis, source: result.source });
    } catch (error) {
      console.warn("[diagnosis.POST] analysis failed", error);
      await updateCampaign(id, workspace.id, {
        creativeDiagnosisStatus: "failed",
      });
      return apiError("diagnosisFailed", 500);
    }
  } catch (error) {
    return handleApiError(error, "campaigns.[id].diagnosis.POST");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;

    const campaign = await getCampaignById(id, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = updateDiagnosisSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const normalized = normalizeCreativeDiagnosis(parsed.data.diagnosis);
    if (!normalized) {
      return apiError("invalidDiagnosis", 400);
    }

    const updated = await updateCampaign(id, workspace.id, {
      creativeDiagnosisStatus: "ready",
      creativeDiagnosis: normalized,
      creativeDiagnosisSource: "edited",
      creativeDiagnosisUpdatedAt: new Date(),
    });

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].diagnosis.PATCH");
  }
}
