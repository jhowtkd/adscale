import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import {
  createShareToken,
  revokePieceReviewShareToken,
  revokeShareToken,
} from "@/lib/share-token";
import { createPieceReviewShare } from "@/server/application/create-piece-review-share";
import { rateLimit } from "@/lib/rate-limit";

const campaignShareSchema = z.object({
  campaignId: z.string().uuid(),
  derivationIds: z.array(z.string().uuid()).min(1).max(50),
}).strict();

const pieceReviewShareSchema = z.object({
  workId: z.string().uuid(),
  outputId: z.string().uuid(),
}).strict();

const bodySchema = z.union([pieceReviewShareSchema, campaignShareSchema]);

const revokeSchema = z.union([
  z.object({ campaignId: z.string().uuid() }).strict(),
  z.object({ workId: z.string().uuid(), outputId: z.string().uuid() }).strict(),
]);

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "general");
    if (!limit.success) {
      return apiError("rateLimitExceeded", 429);
    }

    const { user, workspace } = await requireWorkspaceAccess(request);
    const sessionId = getBetaSessionIdFromRequest(request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    if ("workId" in parsed.data) {
      const created = await createPieceReviewShare({
        workspaceId: workspace.id,
        workItemId: parsed.data.workId,
        outputId: parsed.data.outputId,
      });
      if (!created.ok) {
        if (created.error.code === "work_not_found") return apiError("creativeWorkNotFound", 404);
        if (created.error.code === "output_not_found") return apiError("creativeWorkOutputNotFound", 404);
        return apiError("pieceReviewNotShareable", 409);
      }
      return NextResponse.json({
        shareUrl: created.value.shareUrl,
        expiresAt: created.value.expiresAt.toISOString(),
        outputVersion: created.value.outputVersion,
      });
    }

    const { campaignId, derivationIds } = parsed.data;
    const created = await createShareToken(
      campaignId,
      workspace.id,
      derivationIds
    );
    if (!created.ok) {
      if (created.error === "selection_unavailable") {
        const response = await apiError("shareSelectionUnavailable", 503);
        response.headers.set("Retry-After", "2");
        return response;
      }
      return created.error === "campaign_not_found"
        ? apiError("campaignNotFound", 404)
        : apiError("shareSelectionInvalid", 409);
    }
    const { shareUrl, expiresAt } = created.value;

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
 * Revoke the active share link for a campaign or piece review. The token
 * immediately stops validating (before its expiry). Workspace-scoped.
 */
export async function DELETE(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const parsed = revokeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    if ("outputId" in parsed.data) {
      const revoked = await revokePieceReviewShareToken(workspace.id, parsed.data.outputId);
      return NextResponse.json({ revoked });
    }

    const revoked = await revokeShareToken(parsed.data.campaignId, workspace.id);
    return NextResponse.json({ revoked });
  } catch (error) {
    return handleApiError(error, "share.DELETE");
  }
}
