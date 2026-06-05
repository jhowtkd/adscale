import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetWithMetadata, updateAssetMetadata } from "@/server/repositories/asset";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzePreflight, preflightResultSchema } from "@/server/ai/preflight-analysis";
import { buildCreativeReadiness } from "@/server/ai/creative-readiness";
import { logger } from "@/lib/logger";
import { spendCreditsOrApiError } from "@/server/billing/gates";

function buildCampaignBrief(campaign: Awaited<ReturnType<typeof getCampaignById>>) {
  if (!campaign) return undefined;
  return {
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
  };
}

function readinessFromPreflight(
  preflight: z.infer<typeof preflightResultSchema>,
  campaign: Awaited<ReturnType<typeof getCampaignById>>,
  campaignId: string,
  assetId: string,
  analyzedAt: string | undefined,
  preflightStatus: "pending" | "analyzing" | "completed" | "failed"
) {
  return buildCreativeReadiness({
    preflight,
    campaignId,
    assetId,
    analyzedAt,
    preflightStatus,
    campaignBrief: buildCampaignBrief(campaign),
  });
}

async function parseForceRerun(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  if (url.searchParams.get("force") === "1") {
    return true;
  }
  try {
    const body = await request.clone().json();
    return body?.force === true;
  } catch {
    return false;
  }
}

const preflightMetadataSchema = z.object({
  preflightResult: preflightResultSchema,
  analyzedAt: z.string().datetime(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId, assetId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const asset = await getAssetWithMetadata(assetId, workspace.id);
    if (!asset || asset.campaignId !== campaignId) {
      return apiError("notFound", 404);
    }

    // Stale analysis check: if analyzing for > 5 min, reset to pending
    const isStaleAnalyzing =
      asset.analysisStatus === "analyzing" &&
      asset.analyzedAt &&
      Date.now() - new Date(asset.analyzedAt).getTime() > 5 * 60 * 1000;

    if (isStaleAnalyzing) {
      await updateAssetMetadata(assetId, workspace.id, {}, "pending");
      return NextResponse.json({ preflight: null, readiness: null, status: "pending" });
    }

    if (!asset.metadata || (asset.analysisStatus !== "completed" && asset.analysisStatus !== "analyzing")) {
      return NextResponse.json({
        preflight: null,
        readiness: null,
        status: asset.analysisStatus ?? "pending",
      });
    }

    const parsed = preflightMetadataSchema.safeParse(asset.metadata);
    if (!parsed.success) {
      return NextResponse.json({ preflight: null, readiness: null, status: "pending" });
    }

    const status = asset.analysisStatus ?? "pending";
    const readiness =
      status === "completed"
        ? readinessFromPreflight(
            parsed.data.preflightResult,
            campaign,
            campaignId,
            assetId,
            parsed.data.analyzedAt,
            status
          )
        : null;

    return NextResponse.json({
      preflight: parsed.data.preflightResult,
      readiness,
      status,
      analyzedAt: parsed.data.analyzedAt,
    });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.[assetId].preflight.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId, assetId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const asset = await getAssetWithMetadata(assetId, workspace.id);
    if (!asset || asset.campaignId !== campaignId) {
      return apiError("notFound", 404);
    }

    // Race-condition guard + stale check
    const isStaleAnalyzing =
      asset.analysisStatus === "analyzing" &&
      asset.analyzedAt &&
      Date.now() - new Date(asset.analyzedAt).getTime() > 5 * 60 * 1000;

    if (asset.analysisStatus === "analyzing" && !isStaleAnalyzing) {
      return apiError("analysisInProgress", 429);
    }

    const forceRerun = await parseForceRerun(request);

    if (!forceRerun && asset.metadata && asset.analysisStatus === "completed") {
      const parsed = preflightMetadataSchema.safeParse(asset.metadata);
      if (parsed.success) {
        const readiness = readinessFromPreflight(
          parsed.data.preflightResult,
          campaign,
          campaignId,
          assetId,
          parsed.data.analyzedAt,
          asset.analysisStatus
        );
        return NextResponse.json({
          preflight: parsed.data.preflightResult,
          readiness,
          status: asset.analysisStatus,
          analyzedAt: parsed.data.analyzedAt,
          cached: true,
        });
      }
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "creative_qa",
      amount: 1,
      idempotencyKey: `preflight:${campaignId}:${assetId}`,
      metadata: { campaignId, assetId },
    });
    if (creditError) return creditError;

    await updateAssetMetadata(assetId, workspace.id, {}, "analyzing");

    try {
      const imageBuffer = await downloadBuffer(asset.key);
      const locale = request.headers.get("accept-language")?.includes("pt") ? "pt-BR" : "en";

      const result = await analyzePreflight({
        assetBuffer: imageBuffer,
        mimeType: asset.type || "image/png",
        claimedWidth: asset.width,
        claimedHeight: asset.height,
        campaignBrief: buildCampaignBrief(campaign),
        locale,
      });

      const metadata = {
        preflightResult: result,
        analyzedAt: new Date().toISOString(),
      };

      await updateAssetMetadata(assetId, workspace.id, metadata, "completed");

      const readiness = readinessFromPreflight(
        result,
        campaign,
        campaignId,
        assetId,
        metadata.analyzedAt,
        "completed"
      );

      return NextResponse.json({
        preflight: result,
        readiness,
        status: "completed",
        analyzedAt: metadata.analyzedAt,
      });
    } catch (error) {
      logger.warn("[preflight.POST] analysis failed", error);
      await updateAssetMetadata(assetId, workspace.id, { preflightResult: null }, "failed");
      return apiError("preflightAnalysisFailed", 500);
    }
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.[assetId].preflight.POST");
  }
}
