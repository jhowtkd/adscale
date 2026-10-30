import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { CATALOG_PAGE_DEFAULT_LIMIT, CATALOG_PAGE_MAX_LIMIT } from "@/lib/catalog-page";
import { parseKeysetIdsParam, parseKeysetPageParams } from "@/lib/keyset-page";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  getCampaignAssetOverview,
  getCampaignAssetPage,
  getCampaignAssetsByIds,
} from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";

const CAMPAIGN_PAGE_BOUNDS = {
  defaultLimit: CATALOG_PAGE_DEFAULT_LIMIT,
  maxLimit: CATALOG_PAGE_MAX_LIMIT,
} as const;

type AssetRow = Awaited<ReturnType<typeof getCampaignAssetsByIds>>[number];

async function withUrl(asset: AssetRow) {
  return { ...asset, url: await objectStorage.signedDownloadUrl(asset.key) };
}

/**
 * Materiais da Campanha (#503): keyset pages of `limit` (default 24, max 48)
 * with `cursor`, or the materials named by `ids` (max 48, never with
 * `cursor`). Only the first page carries `featured` and `total`. A Campanha
 * outside the workspace still answers an empty 200, unlike `/derivations` (R7).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const { searchParams } = new URL(request.url);
    const page = parseKeysetPageParams(searchParams, CAMPAIGN_PAGE_BOUNDS);
    const ids = parseKeysetIdsParam(searchParams, CAMPAIGN_PAGE_BOUNDS.maxLimit);
    if (!page || ids === null || (ids && page.cursor)) {
      return apiError("invalidInput", 400);
    }

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return NextResponse.json(ids ? { assets: [] } : { assets: [], nextCursor: null });
    }

    if (ids) {
      const rows = await getCampaignAssetsByIds(campaignId, workspace.id, ids);
      return NextResponse.json({ assets: await Promise.all(rows.map(withUrl)) });
    }

    if (page.cursor) {
      const assetPage = await getCampaignAssetPage(campaignId, workspace.id, page);
      return NextResponse.json({
        assets: await Promise.all(assetPage.items.map(withUrl)),
        nextCursor: assetPage.nextCursor,
      });
    }

    const [assetPage, overview] = await Promise.all([
      getCampaignAssetPage(campaignId, workspace.id, page),
      getCampaignAssetOverview(campaignId, workspace.id),
    ]);
    const assets = await Promise.all(assetPage.items.map(withUrl));
    // A featured material already on the page reuses that row's URL.
    const featuredWithUrl = (asset: AssetRow | null) =>
      asset ? (assets.find((item) => item.id === asset.id) ?? withUrl(asset)) : null;
    const base = await featuredWithUrl(overview.base);

    return NextResponse.json({
      assets,
      nextCursor: assetPage.nextCursor,
      featured: { base },
      total: overview.total,
    });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.GET");
  }
}
