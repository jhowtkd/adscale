import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { eq, and, sql } from "drizzle-orm";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignById,
  refreshCampaignStatus,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  createDerivation,
  failStaleActiveDerivations,
  getDerivationsByCampaign,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import { getUserLocale } from "@/server/repositories/user";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";
import { serializeDerivationForApi } from "@/server/ai/derivation-auto-retry-observability";
import { spendOrApiError } from "@/server/billing/paywall";
import { z } from "zod";

const restyleSchema = z.object({
  styleAssetIds: z.array(z.string().uuid()).optional(),
  styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
  creativeLevel: z.enum(["conservative", "balanced", "bold", "extreme"]).optional(),
});

const STALE_ACTIVE_DERIVATION_MINUTES = 10;

type CampaignAsset = Awaited<ReturnType<typeof getAssetsByCampaign>>[number];

function resolveRestylingBaseAsset(assets: CampaignAsset[]) {
  return (
    assets.find((asset) => asset.role === "base") ??
    assets.find((asset) => asset.role !== "style_reference") ??
    null
  );
}

function resolveRestylingStyleAsset(
  assets: CampaignAsset[],
  styleAssetId: string | undefined,
  baseAssetId: string
) {
  if (styleAssetId) {
    const selected = assets.find((asset) => asset.id === styleAssetId);
    if (selected?.role === "style_reference" && selected.id !== baseAssetId) {
      return selected;
    }
    return null;
  }

  return assets.find(
    (asset) => asset.id !== baseAssetId && asset.role === "style_reference"
  ) ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;
    const [locale, campaign] = await Promise.all([
      getUserLocale(user.id),
      getCampaignById(campaignId, workspace.id),
    ]);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = restyleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { styleAssetIds, styleIntensity, creativeLevel } = parsed.data;

    // Rate limit: block if there are already queued/processing derivations
    const existingQueued = await db.select({ id: derivations.id })
      .from(derivations)
      .where(
        and(
          eq(derivations.campaignId, campaignId),
          eq(derivations.workspaceId, workspace.id),
          sql`${derivations.status} IN ('queued', 'processing')`
        )
      )
      .limit(1);
    if (existingQueued.length > 0) {
      return apiError("derivationsInProgress", 429);
    }

    // Ensure we have a base asset
    const assets = await getAssetsByCampaign(campaignId, workspace.id);
    const baseAsset = resolveRestylingBaseAsset(assets);
    if (!baseAsset) {
      return apiError("missingBaseAsset", 400);
    }

    // If styleAssetIds provided, verify they belong to this campaign
    if (styleAssetIds && styleAssetIds.length > 0) {
      const campaignAssetIds = new Set(assets.map((a) => a.id));
      for (const id of styleAssetIds) {
        if (!campaignAssetIds.has(id)) {
          return apiError("assetNotFound", 404);
        }
      }
    }

    const selectedStyleAssetId =
      styleAssetIds && styleAssetIds.length > 0 ? styleAssetIds[0] : undefined;
    const styleAsset = resolveRestylingStyleAsset(
      assets,
      selectedStyleAssetId,
      baseAsset.id
    );
    if (!styleAsset) {
      return apiError("invalidInput", 400, {
        styleAssetIds: ["Restyling requires a style reference asset different from the factual base asset"],
      });
    }

    // Update campaign for restyling
    await updateCampaign(campaignId, workspace.id, {
      generationMode: "restyling",
      ...(creativeLevel ? { creativeLevel } : styleIntensity ? { styleIntensity } : {}),
    });

    // Spend credits
    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "image_derivation",
      amount: 5,
      idempotencyKey: `restyling:${campaignId}:${baseAsset.id}`,
      metadata: { campaignId, mode: "restyling" },
      userId: user.id,
    });
    if (creditError) return creditError;

    // Create a single restyling derivation
    const derivation = await createDerivation({
      campaignId,
      workspaceId: workspace.id,
      status: "queued",
      generationMode: "restyling",
      variantIndex: 0,
      format: baseAsset.width && baseAsset.height
        ? `${baseAsset.width}x${baseAsset.height}`
        : "1:1",
      styleAssetId: styleAsset.id,
    });

    logger.info(`[restyle POST] created derivationId=${derivation.id} mode=restyling`);

    try {
      await inngest.send({
        name: "derivation.generate",
        data: {
          derivationId: derivation.id,
          campaignId,
          workspaceId: workspace.id,
          triggeredByUserId: user.id,
          locale,
          generationMode: "restyling",
          variantIndex: 0,
          format: derivation.format,
          styleAssetId: styleAsset.id,
        },
      });
      logger.info(`[restyle POST] event sent derivationId=${derivation.id}`);
    } catch (sendErr) {
      logger.error(`[restyle POST] event send FAILED derivationId=${derivation.id}`, sendErr);
      await updateDerivationStatus(derivation.id, workspace.id, "failed");
      return apiError("failedQueueDerivations", 500);
    }

    await updateCampaign(campaignId, workspace.id, {
      status: "generating",
    });

    return NextResponse.json({ derivations: [derivation] }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].restyle.POST");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const stale = await failStaleActiveDerivations(
      campaignId,
      workspace.id,
      STALE_ACTIVE_DERIVATION_MINUTES
    );
    if (stale.length > 0) {
      await refreshCampaignStatus(campaignId, workspace.id);
    }

    const items = await getDerivationsByCampaign(campaignId, workspace.id);
    const derivationsWithImageUrl = await Promise.all(
      items.map(async (d) =>
        serializeDerivationForApi({
          ...d,
          imageUrl: d.outputKey ? await objectStorage.signedDownloadUrl(d.outputKey) : null,
        })
      )
    );
    return NextResponse.json({ derivations: derivationsWithImageUrl });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].restyle.GET");
  }
}
