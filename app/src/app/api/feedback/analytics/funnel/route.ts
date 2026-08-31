import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { buildAnalyticsFunnelSummary } from "@/server/beta-analytics/aggregate";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listBetaAnalyticsEventsForOwner } from "@/server/repositories/beta-analytics";
import { listBetaSessions } from "@/server/repositories/beta-sessions";
import { listUsageEventsForOwner } from "@/server/repositories/usage";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const cachedBuild = unstable_cache(
      async (
        eventsArgs: Parameters<typeof listBetaAnalyticsEventsForOwner>[0],
        sessionsArgs: Parameters<typeof listBetaSessions>[0],
        usageArgs: Parameters<typeof listUsageEventsForOwner>[0],
      ): Promise<[
        Awaited<ReturnType<typeof listBetaAnalyticsEventsForOwner>>,
        Awaited<ReturnType<typeof listBetaSessions>>,
        Awaited<ReturnType<typeof listUsageEventsForOwner>>,
      ]> => {
        const [events, sessions, usageEvents] = await Promise.all([
          listBetaAnalyticsEventsForOwner(eventsArgs),
          listBetaSessions(sessionsArgs),
          listUsageEventsForOwner(usageArgs),
        ]);
        return [events, sessions, usageEvents];
      },
      ["funnel-events"],
      { revalidate: 60, tags: ["feedback-funnel"] }
    );

    const [events, sessions, usageEvents] = await cachedBuild(
      {
        workspaceId: filters.workspaceId,
        sessionId: filters.sessionId,
        from: filters.from,
        to: filters.to,
      },
      {
        workspaceId: filters.workspaceId,
        activeOnly: false,
      },
      {
        workspaceId: filters.workspaceId,
        from: filters.from,
        to: filters.to,
      }
    );

    const filteredSessions = filters.sessionId
      ? sessions.filter((session) => session.id === filters.sessionId)
      : sessions;

    const summary = buildAnalyticsFunnelSummary(events, filteredSessions, usageEvents);

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
