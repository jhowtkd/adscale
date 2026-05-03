import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { env } from "@/server/validation/env";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return NextResponse.json({ assets: [] });
    }

    const assets = await getAssetsByCampaign(campaignId, workspace.id);
    const withUrls = assets.map((asset) => ({
      ...asset,
      url: `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${asset.key}`,
    }));

    return NextResponse.json({ assets: withUrls });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.GET");
  }
}
