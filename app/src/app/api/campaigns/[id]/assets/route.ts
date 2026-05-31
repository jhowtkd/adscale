import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { getPresignedDownloadUrl } from "@/server/storage/r2";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return NextResponse.json({ assets: [] });
    }

    const assets = await getAssetsByCampaign(campaignId, workspace.id);
    const withUrls = await Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        url: await getPresignedDownloadUrl(asset.key),
      }))
    );

    return NextResponse.json({ assets: withUrls });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.GET");
  }
}
