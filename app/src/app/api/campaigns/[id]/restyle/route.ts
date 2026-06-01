import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { apiError, handleApiError } from "@/lib/api-response";
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
import { getPresignedDownloadUrl } from "@/server/storage/r2";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { z } from "zod";

const restyleSchema = z.object({
  styleAssetIds: z.array(z.string().uuid()).optional(),
  styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
});

const STALE_ACTIVE_DERIVATION_MS = 10 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
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

    const { styleAssetIds, styleIntensity } = parsed.data;

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
    const baseAsset = assets.find((a) => a.role === "base") ?? assets[0];
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

    // Update campaign for restyling
    await updateCampaign(campaignId, workspace.id, {
      generationMode: "restyling",
      ...(styleIntensity && { styleIntensity }),
    });

    // Spend credits
    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "image_derivation",
      amount: 5,
      idempotencyKey: `restyling:${campaignId}:${baseAsset.id}`,
      metadata: { campaignId, mode: "restyling" },
      userId: user.id,
    });
    if (creditError) return creditError;

    const selectedStyleAssetId =
      styleAssetIds && styleAssetIds.length > 0 ? styleAssetIds[0] : undefined;

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
      styleAssetId: selectedStyleAssetId,
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
          styleAssetId: selectedStyleAssetId ?? null,
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

    const staleBefore = new Date(Date.now() - STALE_ACTIVE_DERIVATION_MS);
    const stale = await failStaleActiveDerivations(
      campaignId,
      workspace.id,
      staleBefore
    );
    if (stale.length > 0) {
      await refreshCampaignStatus(campaignId, workspace.id);
    }

    const items = await getDerivationsByCampaign(campaignId, workspace.id);
    const derivationsWithImageUrl = await Promise.all(
      items.map(async (d) => ({
        ...d,
        imageUrl: d.outputKey ? await getPresignedDownloadUrl(d.outputKey) : null,
      }))
    );
    return NextResponse.json({ derivations: derivationsWithImageUrl });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].restyle.GET");
  }
}
