import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";
import {
  validateCampaignOwnership,
  validateDerivationOwnership,
} from "@/server/feedback/validate-refs";
import { sanitizeMissionInsightInput } from "@/server/mission-insights/sanitize";
import { recordMissionInsight } from "@/server/mission-insights/service";

const missionInsightLogger = logger.child("mission-insights");

const bodySchema = z.object({
  moment: z.string(),
  missionKey: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  reason: z
    .enum([
      "clear_value",
      "expected_more",
      "confusing",
      "too_slow",
      "quality_issue",
      "cost_concern",
      "not_ready",
      "wrong_timing",
      "other",
    ])
    .optional(),
  optionalText: z.string().max(500).optional(),
  action: z.enum(["submitted", "dismissed", "skipped"]),
  route: z.string().max(500).optional(),
  campaignId: z.string().uuid().optional().nullable(),
  derivationId: z.string().uuid().optional().nullable(),
  diagnosticContext: z.record(z.string(), z.unknown()).optional(),
});

function getRequestId(request: Request): string | undefined {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    undefined
  );
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      missionInsightLogger.warn("mission_insight.validation_failed", {
        workspaceId: workspace.id,
        userId: user.id,
        requestId,
      });
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const data = parsed.data;
    const insight = sanitizeMissionInsightInput({
      moment: data.moment,
      missionKey: data.missionKey,
      sentiment: data.sentiment,
      reason: data.reason,
      optionalText: data.optionalText,
      action: data.action,
      diagnosticContext: data.diagnosticContext,
    });

    if (!insight) {
      return apiError("validation_error", 400, {
        message: "Invalid mission insight payload",
      });
    }

    if (data.campaignId) {
      await validateCampaignOwnership(workspace.id, data.campaignId);
    }

    if (data.derivationId) {
      await validateDerivationOwnership(
        workspace.id,
        data.derivationId,
        data.campaignId
      );
    }

    const report = await recordMissionInsight({
      workspaceId: workspace.id,
      userId: user.id,
      insight,
      route: data.route,
      campaignId: data.campaignId,
      derivationId: data.derivationId,
    });

    missionInsightLogger.info("mission_insight.recorded", {
      reportId: report.id,
      workspaceId: workspace.id,
      moment: insight.moment,
      action: insight.action,
      requestId,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return apiError(error.code, 400);
    }
    return handleApiError(error, "workspace.mission-insights.POST");
  }
}
