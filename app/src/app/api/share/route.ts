import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import { createShareToken } from "@/lib/share-token";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  derivationIds: z.array(z.string().uuid()).min(1).max(50),
});

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

    const { shareUrl, expiresAt } = await createShareToken(
      campaignId,
      workspace.id,
      derivationIds
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
