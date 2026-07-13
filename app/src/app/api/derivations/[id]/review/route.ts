import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { reviewDerivation } from "@/server/application/review-derivation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";

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

/**
 * HTTP adapter for review — auth, parse, beta analytics only.
 * Domain rules live in `reviewDerivation`.
 */
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

    const result = await reviewDerivation({
      workspaceId: workspace.id,
      derivationId: id,
      decision: parsed.data.decision,
      status: parsed.data.status,
      directionReason: parsed.data.directionReason,
      overrideReason: parsed.data.overrideReason,
      actorUserId: user.id,
      evidenceSource: "derivations.review.PATCH",
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "invalid_input":
        case "invalid_direction_reason":
          return apiError("invalidRequestBody", 400);
        case "derivation_not_found":
          return apiError("derivationNotFound", 404);
        case "derivation_hard_failures":
          return apiError("derivationHardFailures", 409, {
            qualityVerdict: result.error.qualityVerdict,
            hardFailures: result.error.hardFailures,
            olharVerdict: result.error.olharVerdict ?? null,
            exportStatus: result.error.exportStatus ?? null,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    const { derivation: updated, effectiveStatus, isOverrideApproval } =
      result.value;

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
        logger.warn(
          "[derivations.review.PATCH] mission_completed analytics failed",
          err
        );
      });
    }

    return NextResponse.json({ derivation: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].review.PATCH");
  }
}
