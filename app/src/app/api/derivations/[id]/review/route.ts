import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { MIN_DIRECTION_REASON_LENGTH } from "@/lib/derivation-review-display";
import { logger } from "@/lib/logger";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import {
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import {
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { getCampaignById, refreshCampaignStatus } from "@/server/repositories/campaign";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { recordCampaignMemoryEntry } from "@/server/memory/campaign-memory-context";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";
import { extractRejectionReason } from "@/server/output-learning/output-decision-reasons";
import type { OutputDecisionSnapshot } from "@/server/output-learning/output-decision-events";

const reviewDecisionSchema = z.enum(["entra", "quase_regenerar", "nao_entra"]);

const bodySchema = z
  .object({
    status: z.enum(["approved", "rejected"]).optional(),
    decision: reviewDecisionSchema.optional(),
    directionReason: z.string().optional(),
    overrideReason: z.string().optional(),
  })
  .refine((data) => data.status || data.decision, {
    message: "status or decision required",
  });

type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

function mapDecisionToStatus(decision: ReviewDecision): "approved" | "rejected" {
  return decision === "entra" ? "approved" : "rejected";
}

function isValidReasonText(reason?: string): boolean {
  return Boolean(reason?.trim() && reason.trim().length >= MIN_DIRECTION_REASON_LENGTH);
}

function buildVerdictSnapshotExtras(derivation: {
  olharVerdict?: unknown;
  exportStatus?: unknown;
}): Pick<OutputDecisionSnapshot, "olharVerdict" | "exportStatus"> {
  const olharVerdict = normalizeOlharVerdictPayload(derivation.olharVerdict);
  const exportStatus = normalizeExportStatusPayload(derivation.exportStatus);

  return {
    ...(olharVerdict !== null
      ? { olharVerdict: { value: olharVerdict.value } }
      : {}),
    ...(exportStatus !== null
      ? { exportStatus: { value: exportStatus.value } }
      : {}),
  };
}

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

    const { decision, directionReason, overrideReason } = parsed.data;
    const effectiveStatus = decision
      ? mapDecisionToStatus(decision)
      : parsed.data.status!;

    if (
      effectiveStatus === "rejected" &&
      (decision === "nao_entra" || decision === "quase_regenerar") &&
      !isValidReasonText(directionReason)
    ) {
      return apiError("invalidRequestBody", 400);
    }

    let isOverrideApproval = false;
    let derivationForAudit:
      | Awaited<ReturnType<typeof getDerivationById>>
      | undefined;

    if (effectiveStatus === "approved") {
      const derivation = await getDerivationById(id, workspace.id);
      if (!derivation) {
        return apiError("derivationNotFound", 404);
      }
      derivationForAudit = derivation;

      const approvable = assertDerivationApprovable(derivation);
      if (!approvable.ok) {
        if (!overrideReason?.trim()) {
          return apiError("derivationHardFailures", 409, {
            qualityVerdict: approvable.qualityVerdict,
            hardFailures: approvable.hardFailures,
            olharVerdict: approvable.olharVerdict ?? null,
            exportStatus: approvable.exportStatus ?? null,
          });
        }
        if (!isValidReasonText(overrideReason)) {
          return apiError("invalidRequestBody", 400);
        }
        isOverrideApproval = true;
      }
    }

    const updated = await updateDerivationStatus(
      id,
      workspace.id,
      effectiveStatus
    );
    if (!updated) {
      return apiError("derivationNotFound", 404);
    }

    const [, campaign] = await Promise.all([
      refreshCampaignStatus(updated.campaignId, workspace.id),
      getCampaignById(updated.campaignId, workspace.id),
    ]);
    if (effectiveStatus === "approved") {
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
          ...(isOverrideApproval ? { approvalOverride: true } : {}),
        },
      }).catch((err) => {
        logger.warn("[derivations.review.PATCH] mission_completed analytics failed", err);
      });
    }

    if (effectiveStatus === "approved" && updated.ctaText?.trim()) {
      await recordCampaignMemoryEntry(updated.campaignId, workspace.id, {
        type: "approved_cta",
        text: `Approved CTA: "${updated.ctaText.trim()}"`,
        derivationId: updated.id,
      });
    } else if (effectiveStatus === "rejected") {
      const rejectionNote =
        updated.regenerationSuggestion ??
        (Array.isArray(updated.hardFailures) && updated.hardFailures.length > 0
          ? `Rejected due to: ${(updated.hardFailures as Array<{ message?: string }>)
              .map((f) => f.message)
              .filter(Boolean)
              .join("; ")}`
          : "Creative rejected by reviewer.");
      await recordCampaignMemoryEntry(updated.campaignId, workspace.id, {
        type: "rejected_output",
        text: rejectionNote,
        derivationId: updated.id,
      });
    }

    await recordBrandMemoryEvent({
      type: effectiveStatus === "approved" ? "creative_approved" : "creative_rejected",
      workspaceId: workspace.id,
      clientProfileId: campaign?.clientProfileId,
      campaignId: updated.campaignId,
      derivationId: updated.id,
      occurredAt: updated.updatedAt,
      summary:
        effectiveStatus === "approved"
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

    const auditDerivation = derivationForAudit ?? updated;
    let snapshotExtras: Partial<OutputDecisionSnapshot> | undefined;

    if (effectiveStatus === "approved" && isOverrideApproval) {
      snapshotExtras = {
        overrideApproved: true,
        ...buildVerdictSnapshotExtras(auditDerivation),
        reason: {
          code: "override_approval",
          text: overrideReason!.trim(),
          source: "review_override",
        },
      };
    } else if (effectiveStatus === "rejected") {
      if (decision === "nao_entra" || decision === "quase_regenerar") {
        snapshotExtras = {
          reason: {
            code: decision,
            text: directionReason!.trim(),
            source: "direction_reason",
          },
        };
      } else {
        snapshotExtras = {
          reason: extractRejectionReason({
            hardFailures: updated.hardFailures,
            scoreIssues: updated.scoreIssues,
            regenerationSuggestion: updated.regenerationSuggestion,
          }),
        };
      }
    }

    void recordOutputDecisionEvidenceBestEffort({
      workspaceId: workspace.id,
      userId: user.id,
      clientProfileId: campaign?.clientProfileId ?? null,
      campaignId: updated.campaignId,
      derivationId: updated.id,
      action: effectiveStatus,
      source: "derivations.review.PATCH",
      snapshotInput: updated,
      snapshotExtras,
    });

    return NextResponse.json({ derivation: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].review.PATCH");
  }
}
