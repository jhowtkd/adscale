import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeSmartResize, getPlatformRules } from "@/server/ai/smart-resize";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    // Get the base asset for analysis
    const assets = await getAssetsByCampaign(campaignId, workspace.id);
    const baseAsset = assets.find((a) => a.role === "base" || a.role === "linked") ?? assets[0];
    if (!baseAsset) {
      return apiError("missingBaseAsset", 400);
    }

    // Download and analyze
    const buffer = await downloadBuffer(baseAsset.key);
    const base64Image = Buffer.from(buffer).toString("base64");
    const analysis = await analyzeSmartResize(base64Image);

    const platformRules = getPlatformRules();
    const campaignPlatforms = campaign.platforms ?? [];

    const recommendations = campaignPlatforms.map((platform) => {
      const rules = platformRules[platform] ?? null;
      const platformRec = analysis.platformRecommendations.find(
        (r) => r.platform === platform
      );
      return {
        platform,
        rules,
        recommendation: platformRec?.recommendation ?? null,
        compliance: platformRec?.compliance ?? "pass",
      };
    });

    return NextResponse.json({
      analysis: {
        crops: analysis.crops,
        safeZones: analysis.safeZones,
        criticalElements: analysis.criticalElements,
      },
      recommendations,
      platformRules,
    });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].smart-resize-preview.GET");
  }
}
