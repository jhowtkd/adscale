import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { BetaEventPropertiesValidationError } from "@/server/beta-analytics/sanitize";
import { createBetaEventBodySchema } from "@/server/beta-analytics/types";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";

const betaAnalyticsLogger = logger.child("beta-analytics");

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
    const parsed = createBetaEventBodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const event = await recordBetaAnalyticsEvent({
      workspaceId: workspace.id,
      userId: user.id,
      source: "client",
      ...parsed.data,
    });

    betaAnalyticsLogger.info("beta_event.created", {
      eventId: event.id,
      workspaceId: workspace.id,
      userId: user.id,
      eventKey: event.eventKey,
      requestId,
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof BetaEventPropertiesValidationError) {
      return apiError("validation_error", 400, { properties: error.message });
    }

    if (error instanceof FeedbackValidationError) {
      return apiError(error.code, 400);
    }

    return handleApiError(error, "analytics.events.POST");
  }
}
