import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import {
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { getCampaignById, refreshCampaignStatus } from "@/server/repositories/campaign";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const sessionId = getBetaSessionIdFromRequest(request);

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    if (parsed.data.status === "approved") {
      const derivation = await getDerivationById(id, workspace.id);
      if (!derivation) {
        return apiError("derivationNotFound", 404);
      }
      const approvable = assertDerivationApprovable(derivation);
      if (!approvable.ok) {
        return apiError("derivationHardFailures", 409, {
          qualityVerdict: approvable.qualityVerdict,
          hardFailures: approvable.hardFailures,
        });
      }
    }

    const updated = await updateDerivationStatus(
      id,
      workspace.id,
      parsed.data.status
    );
    if (!updated) {
      return apiError("derivationNotFound", 404);
    }

    const [, campaign] = await Promise.all([
      refreshCampaignStatus(updated.campaignId, workspace.id),
      getCampaignById(updated.campaignId, workspace.id),
    ]);
    if (parsed.data.status === "approved") {
      void recordBetaAnalyticsEvent({
        workspaceId: workspace.id,
        userId: user.id,
        eventKey: "mission_completed",
        source: "server",
        campaignId: updated.campaignId,
        derivationId: id,
        sessionId,
        properties: {
          missionKey: "review",
          stage: "review",
        },
      }).catch((err) => {
        logger.warn("[derivations.review.PATCH] mission_completed analytics failed", err);
      });
    }

    await recordBrandMemoryEvent({
      type: parsed.data.status === "approved" ? "creative_approved" : "creative_rejected",
      workspaceId: workspace.id,
      clientProfileId: campaign?.clientProfileId,
      campaignId: updated.campaignId,
      derivationId: updated.id,
      occurredAt: updated.updatedAt,
      summary:
        parsed.data.status === "approved"
          ? `Creative was approved for campaign "${campaign?.name ?? updated.campaignId}".`
          : `Creative was rejected for campaign "${campaign?.name ?? updated.campaignId}".`,
      payload: {
        campaign: campaign
          ? {
              name: campaign.name,
              client: campaign.client,
              product: campaign.product,
              objective: campaign.objective,
              audience: campaign.audience,
              offer: campaign.offer,
              tone: campaign.tone,
              constraints: campaign.constraints,
              ctaVariants: campaign.ctaVariants,
              creativeLevel: campaign.creativeLevel,
              selectedReferenceIds: campaign.selectedReferenceIds,
            }
          : null,
        derivation: {
          status: updated.status,
          format: updated.format,
          generationMode: updated.generationMode,
          ctaText: updated.ctaText,
          qualityScore: updated.qualityScore,
          scoreStatus: updated.scoreStatus,
          scoreIssues: updated.scoreIssues,
          regenerationSuggestion: updated.regenerationSuggestion,
          qaStatus: updated.qaStatus,
          qaIssues: updated.qaIssues,
          feedback: updated.feedback,
        },
      },
    });

    return NextResponse.json({ derivation: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].review.PATCH");
  }
}
