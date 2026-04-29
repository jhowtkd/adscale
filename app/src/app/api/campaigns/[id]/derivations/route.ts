import { NextResponse } from "next/server";
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
import { env } from "@/server/validation/env";

const STALE_ACTIVE_DERIVATION_MS = 10 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const plan = await getPlanByCampaign(campaignId, workspace.id);

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

    // Build derivation jobs from campaign configuration
    const generationMode = campaign.generationMode ?? "art_variation";
    const jobs: Array<{
      variantIndex: number;
      ctaText: string | null;
      format: string;
    }> = [];

    if (generationMode === "art_variation") {
      const ctaVariants = campaign.ctaVariants ?? [];
      const validCtas = ctaVariants
        .map((text, index) => ({ text: text.trim(), index }))
        .filter((item) => item.text.length > 0);

      if (validCtas.length === 0) {
        return apiError("noCtasProvided", 400);
      }

      // Infer base format from the first campaign asset
      const assets = await getAssetsByCampaign(campaignId, workspace.id);
      const baseAsset = assets[0];
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
      // format_adaptation: always 3 formats
      const formats = campaign.targetFormats ?? ["1:1", "4:5", "9:16"];
      const ctaVariants = campaign.ctaVariants ?? [];
      for (let i = 0; i < formats.length; i++) {
        jobs.push({
          variantIndex: i,
          ctaText: ctaVariants[i]?.trim() || null,
          format: formats[i],
        });
      }
    }

    const created: Awaited<ReturnType<typeof createDerivation>>[] = [];
    let queuedCount = 0;

    for (const job of jobs) {
      const derivation = await createDerivation({
        campaignId,
        workspaceId: workspace.id,
        planId: plan?.id ?? undefined,
        status: "queued",
        generationMode,
        variantIndex: job.variantIndex,
        ctaText: job.ctaText ?? undefined,
        format: job.format,
      });
      created.push(derivation);
      console.log(`[derivations POST] created derivationId=${derivation.id} mode=${generationMode} index=${job.variantIndex} format=${job.format}`);

      try {
        await inngest.send({
          name: "derivation.generate",
          data: {
            derivationId: derivation.id,
            campaignId,
            workspaceId: workspace.id,
            locale,
            generationMode,
            variantIndex: job.variantIndex,
            ctaText: job.ctaText,
            format: job.format,
          },
        });
        console.log(`[derivations POST] event sent derivationId=${derivation.id}`);
        queuedCount++;
      } catch (sendErr) {
        console.error(`[derivations POST] event send FAILED derivationId=${derivation.id}`, sendErr);
        await updateDerivationStatus(derivation.id, workspace.id, "failed");
      }
    }

    await updateCampaign(campaignId, workspace.id, {
      status: queuedCount > 0 ? "generating" : "failed",
    });

    return NextResponse.json({ derivations: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].derivations.POST");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

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
    const derivationsWithImageUrl = items.map((d) => ({
      ...d,
      imageUrl: d.outputKey ? `${env.R2_PUBLIC_BASE_URL}/${d.outputKey}` : null,
    }));
    return NextResponse.json({ derivations: derivationsWithImageUrl });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].derivations.GET");
  }
}
