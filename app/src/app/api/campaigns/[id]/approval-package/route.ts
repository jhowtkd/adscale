import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  buildApprovalPackageSnapshot,
  expandPackageDerivationIds,
  getApprovedRootDerivations,
  type DerivationLike,
} from "@/server/ai/client-approval-package";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import {
  getLatestShareLinkForCampaign,
  upsertShareLinkForCampaign,
} from "@/server/repositories/share-link";

const SHARE_LINK_TTL_DAYS = 7;

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

const postBodySchema = z.object({
  derivationIds: z.array(z.string().uuid()).min(1).max(50),
  notes: z.string().max(5000).optional(),
});

function buildShareUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${baseUrl}/share/${token}`;
}

function toDerivationLike(
  derivation: Awaited<ReturnType<typeof getDerivationsByCampaign>>[number]
): DerivationLike {
  return {
    id: derivation.id,
    parentId: derivation.parentId,
    status: derivation.status,
    outputKey: derivation.outputKey,
    format: derivation.format,
    generationMode: derivation.generationMode,
    variantIndex: derivation.variantIndex,
    ctaText: derivation.ctaText,
    isPreview: derivation.isPreview,
  };
}

async function loadCampaignContext(campaignId: string, workspaceId: string) {
  const [campaign, derivations] = await Promise.all([
    getCampaignById(campaignId, workspaceId),
    getDerivationsByCampaign(campaignId, workspaceId),
  ]);

  if (!campaign) {
    return null;
  }

  return {
    campaign,
    derivations: derivations.map(toDerivationLike),
  };
}

function validateSelectedRoots(
  selectedRootIds: string[],
  derivations: DerivationLike[]
) {
  const approvedRoots = new Set(
    getApprovedRootDerivations(derivations).map((d) => d.id)
  );

  for (const id of selectedRootIds) {
    if (!approvedRoots.has(id)) {
      return false;
    }
  }

  return true;
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

    const context = await loadCampaignContext(campaignId, workspace.id);
    if (!context) {
      return apiError("campaignNotFound", 404);
    }

    const { campaign, derivations } = context;
    const shareLink = await getLatestShareLinkForCampaign(
      campaignId,
      workspace.id
    );

    const approvedRoots = getApprovedRootDerivations(derivations);
    const selectedRootIds = shareLink
      ? derivations
          .filter(
            (d) =>
              shareLink.derivationIds.includes(d.id) &&
              !d.parentId
          )
          .map((d) => d.id)
      : approvedRoots.map((d) => d.id);

    const snapshot = buildApprovalPackageSnapshot({
      selectedRootIds,
      derivations,
      campaign: {
        notes: campaign.notes,
        product: campaign.product,
        offer: campaign.offer,
      },
      packageDerivationIds: shareLink?.derivationIds,
    });

    return NextResponse.json({
      campaignId,
      availableRoots: approvedRoots.map((d) => ({
        id: d.id,
        format: d.format,
        ctaText: d.ctaText,
        variantIndex: d.variantIndex,
      })),
      selectedRootIds,
      package: snapshot,
      shareUrl: shareLink ? buildShareUrl(shareLink.token) : null,
      expiresAt: shareLink?.expiresAt.toISOString() ?? null,
    });
  } catch (error) {
    logRouteError("campaigns.[id].approval-package.GET", error);
    return handleApiError(error, "campaigns.[id].approval-package.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = postBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const context = await loadCampaignContext(campaignId, workspace.id);
    if (!context) {
      return apiError("campaignNotFound", 404);
    }

    const { campaign, derivations } = context;
    const selectedRootIds = [...new Set(parsed.data.derivationIds)];

    if (!validateSelectedRoots(selectedRootIds, derivations)) {
      return apiError("invalidApprovalPackageSelection", 409);
    }

    if (parsed.data.notes !== undefined) {
      await updateCampaign(campaignId, workspace.id, {
        notes: parsed.data.notes,
      });
    }

    const expandedIds = expandPackageDerivationIds(
      selectedRootIds,
      derivations
    );
    const expiresAt = new Date(
      Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const shareLink = await upsertShareLinkForCampaign({
      campaignId,
      workspaceId: workspace.id,
      derivationIds: expandedIds,
      expiresAt,
    });

    const snapshot = buildApprovalPackageSnapshot({
      selectedRootIds,
      derivations,
      campaign: {
        notes: parsed.data.notes ?? campaign.notes,
        product: campaign.product,
        offer: campaign.offer,
      },
      packageDerivationIds: expandedIds,
    });

    return NextResponse.json({
      campaignId,
      selectedRootIds,
      package: snapshot,
      shareUrl: buildShareUrl(shareLink.token),
      expiresAt: shareLink.expiresAt.toISOString(),
    });
  } catch (error) {
    logRouteError("campaigns.[id].approval-package.POST", error);
    return handleApiError(error, "campaigns.[id].approval-package.POST");
  }
}
