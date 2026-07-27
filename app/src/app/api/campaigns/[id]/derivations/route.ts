import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
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
  failStaleActiveDerivations,
  getDerivationsByCampaign,
} from "@/server/repositories/derivation";
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import { getUserLocale } from "@/server/repositories/user";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationMode,
} from "@/server/generation/canonical/types";
import {
  campaignBatchDerivationSettlementAdapter,
} from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import {
  deriveRegenerationPreview,
  derivationHasRegenerationPreview,
  resolveContractForDerivationRow,
} from "@/server/ai/regeneration-correction-brief";
import {
  outputLearningApplicationSchema,
  sanitizeOutputLearningApplication,
} from "@/server/human-quality/application-schema";
import { serializeDerivationForApi } from "@/server/ai/derivation-auto-retry-observability";
import { resolveWorkspaceProduceSurface } from "@/server/application/resolve-workspace-produce-surface";

const STALE_ACTIVE_DERIVATION_MINUTES = 10;

const postBodySchema = z.object({
  preview: z.boolean().optional(),
  styleAssetId: z.string().min(1).optional(),
  outputLearningApplication: outputLearningApplicationSchema.optional(),
});

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
    let outputLearningApplication: ReturnType<
      typeof sanitizeOutputLearningApplication
    > | null = null;
    try {
      const rawBody = await request.json();
      const parsedBody = postBodySchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return apiError("invalidRequestBody", 400, parsedBody.error.flatten());
      }
      isPreview = parsedBody.data.preview === true;
      if (parsedBody.data.styleAssetId) {
        requestedStyleAssetId = parsedBody.data.styleAssetId;
      }
      if (parsedBody.data.outputLearningApplication) {
        outputLearningApplication = sanitizeOutputLearningApplication(
          parsedBody.data.outputLearningApplication
        );
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

    logger.info(
      `[derivations POST] stale cleanup=${stale.length} isPreview=${isPreview}`
    );

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
    logger.info(
      `[derivations POST] rate limit check blocked=${existingQueued.length > 0} queuedId=${existingQueued[0]?.id ?? "none"} queuedIsPreview=${existingQueued[0]?.isPreview ?? "none"}`
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

      // Infer the format when a reference exists; campaigns created from
      // scratch intentionally have no base asset.
      const assets = await getAssetsByCampaign(campaignId, workspace.id);
      const baseAsset = assets[0];
      let baseFormat = campaign.targetFormats?.[0] ?? "1:1";
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
    const unitChargeAmount = GENERATION_CREDIT_COSTS.singleDerivation;
    const unitCount = jobsToCreate.length;
    const billingKey = `derivations:${campaignId}:${isPreview ? "preview" : "batch"}:${jobsToCreate
      .map((job) => `${job.variantIndex}:${job.ctaText ?? ""}:${job.format}`)
      .join("|")}`;

    const settled = await startGenerationSettlement(
      campaignBatchDerivationSettlementAdapter({
        workspaceId: workspace.id,
        userId: user.id,
        campaignId,
        billingKey,
        amount: unitCount * unitChargeAmount,
        unitCount,
        unitChargeAmount,
        action: "image_derivation",
        intentMode: ((generationMode as GenerationMode) || "art_variation"),
        locale,
        isPreview,
        planId: plan?.id,
        jobs: jobsToCreate.map((job) => ({
          variantIndex: job.variantIndex,
          ctaText: job.ctaText,
          format: job.format,
          generationMode,
          ...(generationMode === "restyling" && requestedStyleAssetId
            ? { styleAssetId: requestedStyleAssetId }
            : {}),
          ...(generationMode === "art_variation"
            ? { creativeLevel: campaign.creativeLevel ?? "balanced" }
            : {}),
          ...(outputLearningApplication
            ? { outputLearningApplication }
            : {}),
        })),
      })
    );

    if (!settled.ok) {
      if (settled.error.code === "credit_blocked") {
        return apiError("creditBlocked", 402, settled.error.details);
      }
      // Preserve historical 201 body with failed rows; settlement already
      // marked them failed and refunded the batch charge once.
      logger.error(
        `[derivations POST] dispatch FAILED campaignId=${campaignId}`,
        settled.error
      );
      await updateCampaign(campaignId, workspace.id, { status: "failed" });
      return NextResponse.json(
        { derivations: settled.error.value.derivations },
        { status: 201 },
      );
    }

    const created = settled.value.derivations;
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

    const campaignRow = await getCampaignById(campaignId, workspace.id);
    if (!campaignRow) {
      return apiError("campaignNotFound", 404);
    }

    const items = await getDerivationsByCampaign(campaignId, workspace.id);
    const derivationsWithImageUrl = await Promise.all(
      items.map(async (d) => {
        const base = serializeDerivationForApi({
          ...d,
          imageUrl: d.outputKey ? await objectStorage.signedDownloadUrl(d.outputKey) : null,
        });
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

    // Phase 6 / item 49: domain produce rules calculated on the server.
    const produceSurface = resolveWorkspaceProduceSurface({
      campaign: {
        generationMode: campaignRow.generationMode,
        creativeLevel: campaignRow.creativeLevel,
        ctaVariants: campaignRow.ctaVariants,
        targetFormats: campaignRow.targetFormats,
      },
      derivations: derivationsWithImageUrl.map((d) => ({
        id: d.id,
        isPreview: d.isPreview,
        status: d.status,
        imageUrl: d.imageUrl,
        outputKey: d.outputKey,
        qualityVerdict: d.qualityVerdict ?? null,
        hardFailures: d.hardFailures ?? null,
      })) as Parameters<typeof resolveWorkspaceProduceSurface>[0]["derivations"],
    });

    return NextResponse.json({
      derivations: derivationsWithImageUrl,
      produceSurface,
    });
  } catch (error) {
    logRouteError("campaigns.[id].derivations.GET", error);
    return handleApiError(error, "campaigns.[id].derivations.GET");
  }
}
