import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  expandPackageDerivationIds,
  getPackageEligibleRoots,
  type DerivationLike,
} from "@/server/ai/client-approval-package";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { createShareToken, revokeShareToken } from "@/lib/share-token";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  derivationIds: z.array(z.string().uuid()).min(1).max(50),
});

const revokeSchema = z.object({
  campaignId: z.string().uuid(),
});

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
    olharVerdict: derivation.olharVerdict ?? null,
    exportStatus: derivation.exportStatus ?? null,
  };
}

function validateSelectedRoots(
  selectedRootIds: string[],
  derivations: DerivationLike[]
) {
  const approvedRoots = new Set(
    getPackageEligibleRoots(derivations).map((d) => d.id)
  );

  for (const id of selectedRootIds) {
    if (!approvedRoots.has(id)) {
      return false;
    }
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "general");
    if (!limit.success) {
      return apiError("rateLimitExceeded", 429);
    }

    const { user, workspace } = await requireWorkspaceAccess(request);
    const sessionId = getBetaSessionIdFromRequest(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const { campaignId, derivationIds } = parsed.data;
    const selectedRootIds = [...new Set(derivationIds)];

    const [campaign, campaignDerivations] = await Promise.all([
      getCampaignById(campaignId, workspace.id),
      getDerivationsByCampaign(campaignId, workspace.id),
    ]);

    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const derivations = campaignDerivations.map(toDerivationLike);

    if (!validateSelectedRoots(selectedRootIds, derivations)) {
      return apiError("invalidApprovalPackageSelection", 409);
    }

    const expandedDerivationIds = expandPackageDerivationIds(
      selectedRootIds,
      derivations
    );

    const { shareUrl, expiresAt } = await createShareToken(
      campaignId,
      workspace.id,
      expandedDerivationIds
    );

    void recordBetaAnalyticsEvent({
      workspaceId: workspace.id,
      userId: user.id,
      eventKey: "mission_completed",
      source: "server",
      campaignId,
      sessionId,
      properties: {
        missionKey: "share",
        stage: "share",
      },
    }).catch((err) => {
      logger.warn("[share.POST] mission_completed analytics failed", err);
    });

    return NextResponse.json({ shareUrl, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return handleApiError(error, "share.POST");
  }
}

/**
 * Revoke the active share link for a campaign. The token immediately stops
 * validating (before its expiry). Workspace-scoped: a user can only revoke
 * share links for campaigns in their own workspace.
 */
export async function DELETE(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const revoked = await revokeShareToken(parsed.data.campaignId, workspace.id);
    return NextResponse.json({ revoked });
  } catch (error) {
    return handleApiError(error, "share.DELETE");
  }
}
