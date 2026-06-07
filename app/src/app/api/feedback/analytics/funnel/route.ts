import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { buildAnalyticsFunnelSummary } from "@/server/beta-analytics/aggregate";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listBetaAnalyticsEventsForOwner } from "@/server/repositories/beta-analytics";
import { listBetaSessions } from "@/server/repositories/beta-sessions";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const events = await listBetaAnalyticsEventsForOwner({
      workspaceId: filters.workspaceId,
      sessionId: filters.sessionId,
      from: filters.from,
      to: filters.to,
    });

    const sessions = await listBetaSessions({
      workspaceId: filters.workspaceId,
      activeOnly: false,
    });

    const filteredSessions = filters.sessionId
      ? sessions.filter((session) => session.id === filters.sessionId)
      : sessions;

    const summary = buildAnalyticsFunnelSummary(events, filteredSessions);

    return NextResponse.json({
      filters: {
        workspaceId: filters.workspaceId ?? null,
        sessionId: filters.sessionId ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      ...summary,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "feedback.analytics.funnel.GET");
  }
}
