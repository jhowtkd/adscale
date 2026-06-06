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
import { getPlanByCampaign } from "@/server/repositories/plan";
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
import {
  deriveRegenerationPreview,
  derivationHasRegenerationPreview,
  resolveContractForDerivationRow,
} from "@/server/ai/regeneration-correction-brief";

const STALE_ACTIVE_DERIVATION_MINUTES = 10;

function logRouteError(context: string, error: unknown) {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          code: (error as NodeJS.ErrnoException).code,
        }
      : { message: String(error) };
  logger.error(`[${context}]`, details);
}

function debugDerivationsPostLog(
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  // #region agent log
  fetch("http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "021503",
    },
    body: JSON.stringify({
      sessionId: "021503",
      runId: "preview-429",
      hypothesisId,
      location: "derivations/route.ts:POST",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

async function deleteExistingPreviewDerivations(
  campaignId: string,
  workspaceId: string
) {
  const existingPreviews = await db
    .select({ id: derivations.id })
    .from(derivations)
    .where(
      and(
        eq(derivations.campaignId, campaignId),
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.isPreview, true)
      )
    );
  if (existingPreviews.length === 0) {
    return 0;
  }
  await Promise.all(
    existingPreviews.map((preview) =>
      db.delete(derivations).where(eq(derivations.id, preview.id))
    )
  );
  return existingPreviews.length;
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
    const [locale, campaign, plan] = await Promise.all([
      getUserLocale(user.id),
      getCampaignById(campaignId, workspace.id),
      getPlanByCampaign(campaignId, workspace.id),
    ]);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    let isPreview = false;
    let requestedStyleAssetId: string | null = null;
    try {
      const body = await request.json();
      isPreview = body.preview === true;
      if (typeof body.styleAssetId === "string" && body.styleAssetId.length > 0) {
        requestedStyleAssetId = body.styleAssetId;
      }
    } catch {
      // No body or invalid JSON, treat as non-preview
    }

    const stale = await failStaleActiveDerivations(
      campaignId,
      workspace.id,
      STALE_ACTIVE_DERIVATION_MINUTES
    );
    if (stale.length > 0) {
      await refreshCampaignStatus(campaignId, workspace.id);
    }
    debugDerivationsPostLog(
      "stale cleanup",
      { staleCount: stale.length, isPreview },
      "H3"
    );

    let deletedPreviews = 0;
    if (isPreview) {
      deletedPreviews = await deleteExistingPreviewDerivations(
        campaignId,
        workspace.id
      );
      debugDerivationsPostLog(
        "preview cleanup",
        { deletedPreviews },
        "H4"
      );
    }

    // Rate limit: block if there are already queued/processing derivations
    const existingQueued = await db
      .select({ id: derivations.id, isPreview: derivations.isPreview })
      .from(derivations)
      .where(
        and(
          eq(derivations.campaignId, campaignId),
          eq(derivations.workspaceId, workspace.id),
          sql`${derivations.status} IN ('queued', 'processing')`
        )
      )
      .limit(1);
    debugDerivationsPostLog(
      "rate limit check",
      {
        isPreview,
        blocked: existingQueued.length > 0,
        queuedId: existingQueued[0]?.id ?? null,
        queuedIsPreview: existingQueued[0]?.isPreview ?? null,
      },
      "H1"
    );
    if (existingQueued.length > 0) {
      return apiError("derivationsInProgress", 429);
    }

    // Build derivation jobs from campaign configuration
    const generationMode = campaign.generationMode ?? "art_variation";
    const jobs: Array<{
      variantIndex: number;
      ctaText: string | null;
      format: string;
    }> = [];

    if (generationMode === "art_variation") {
      const ctaVariants = campaign.ctaVariants ?? [];
      const validCtas = ctaVariants.flatMap((text, index) => {
        const trimmed = text.trim();
        return trimmed.length > 0 ? [{ text: trimmed, index }] : [];
      });

      if (validCtas.length === 0) {
        return apiError("noCtasProvided", 400);
      }

      // Infer base format from the first campaign asset
      const assets = await getAssetsByCampaign(campaignId, workspace.id);
      const baseAsset = assets[0];
      if (!baseAsset) {
        return apiError("missingBaseAsset", 400);
      }

      let baseFormat = "1:1";
      if (baseAsset?.width && baseAsset?.height && baseAsset.width > 0 && baseAsset.height > 0) {
        const ratio = baseAsset.height / baseAsset.width;
        if (ratio > 1.35) baseFormat = "9:16";
        else if (ratio > 1.1) baseFormat = "4:5";
        else baseFormat = "1:1";
      }

      for (const item of validCtas) {
        jobs.push({
          variantIndex: item.index,
          ctaText: item.text,
          format: baseFormat,
        });
      }
    } else {
      // format_adaptation: generate for all selected target formats
      const targetFormats = campaign.targetFormats;
      if (!targetFormats || targetFormats.length === 0) {
        return apiError("invalidTargetFormats", 400);
      }
      const ctaVariants = campaign.ctaVariants ?? [];
      for (const format of targetFormats) {
        jobs.push({
          variantIndex: 0,
          ctaText: ctaVariants[0]?.trim() || null,
          format,
        });
      }
    }

    const jobsToCreate = isPreview ? jobs.slice(0, 1) : jobs;
    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "image_derivation",
      amount: jobsToCreate.length * 5,
      idempotencyKey: `derivations:${campaignId}:${isPreview ? "preview" : "batch"}:${jobsToCreate
        .map((job) => `${job.variantIndex}:${job.ctaText ?? ""}:${job.format}`)
        .join("|")}`,
      metadata: { campaignId, count: jobsToCreate.length, preview: isPreview },
      userId: user.id,
    });
    if (creditError) return creditError;

    const results = await Promise.all(
      jobsToCreate.map(async (job) => {
        const derivation = await createDerivation({
          campaignId,
          workspaceId: workspace.id,
          planId: plan?.id ?? undefined,
          status: "queued",
          generationMode,
          variantIndex: job.variantIndex,
          ctaText: job.ctaText ?? undefined,
          format: job.format,
          isPreview,
          ...(generationMode === "restyling" &&
            requestedStyleAssetId && { styleAssetId: requestedStyleAssetId }),
        });
        logger.info(`[derivations POST] created derivationId=${derivation.id} mode=${generationMode} index=${job.variantIndex} format=${job.format} isPreview=${isPreview}`);

        try {
          await inngest.send({
            name: "derivation.generate",
            data: {
              derivationId: derivation.id,
              campaignId,
              workspaceId: workspace.id,
              triggeredByUserId: user.id,
              locale,
              generationMode,
              variantIndex: job.variantIndex,
              ctaText: job.ctaText,
              format: job.format,
              isPreview,
              styleAssetId: generationMode === "restyling" ? (requestedStyleAssetId ?? null) : null,
              ...(generationMode === "art_variation" && {
                creativeLevel: campaign.creativeLevel ?? "balanced",
              }),
            },
          });
          logger.info(`[derivations POST] event sent derivationId=${derivation.id}`);
          return { derivation, queued: true };
        } catch (sendErr) {
          logger.error(`[derivations POST] event send FAILED derivationId=${derivation.id}`, sendErr);
          await updateDerivationStatus(derivation.id, workspace.id, "failed");
          return { derivation, queued: false };
        }
      })
    );

    const created = results.map((result) => result.derivation);
    const queuedCount = results.filter((result) => result.queued).length;

    await updateCampaign(campaignId, workspace.id, {
      status: queuedCount > 0 ? "generating" : "failed",
    });

    return NextResponse.json({ derivations: created }, { status: 201 });
  } catch (error) {
    logRouteError("campaigns.[id].derivations.POST", error);
    return handleApiError(error, "campaigns.[id].derivations.POST");
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
      items.map(async (d) => {
        const base = {
          ...d,
          imageUrl: d.outputKey ? await getPresignedDownloadUrl(d.outputKey) : null,
        };
        if (!derivationHasRegenerationPreview(d)) {
          return base;
        }
        const contract = resolveContractForDerivationRow(d);
        const preview = deriveRegenerationPreview(d, contract);
        return {
          ...base,
          regenerationPrimaryReason: preview.primaryReason,
          regenerationIssueBreakdown: preview.issueBreakdown,
        };
      })
    );
    return NextResponse.json({ derivations: derivationsWithImageUrl });
  } catch (error) {
    logRouteError("campaigns.[id].derivations.GET", error);
    return handleApiError(error, "campaigns.[id].derivations.GET");
  }
}
