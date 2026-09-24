import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { buildAnalyticsFunnelSummary, listStudioUsageWindows } from "@/server/beta-analytics/aggregate";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listBetaAnalyticsEventsForOwner } from "@/server/repositories/beta-analytics";
import { listBetaSessions } from "@/server/repositories/beta-sessions";
import { listStudioUsageEventsForWindows } from "@/server/repositories/usage";
import { listSelectedCreativeWorkPieceVersions } from "@/server/repositories/selected-piece-versions";

// listBetaAnalyticsEventsForOwner uses this cap. A full page may be truncated,
// so rollout evidence must never treat it as a complete population.
const OWNER_ANALYTICS_EVENT_CAP = 5_000;

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const cachedBuild = unstable_cache(
      async (
        eventsArgs: Parameters<typeof listBetaAnalyticsEventsForOwner>[0],
        sessionsArgs: Parameters<typeof listBetaSessions>[0],
      ) => {
        const [events, sessions] = await Promise.all([
          listBetaAnalyticsEventsForOwner(eventsArgs),
          listBetaSessions(sessionsArgs),
        ]);
        const reportAsOf = eventsArgs?.to ?? new Date();
        const usageEvents = await listStudioUsageEventsForWindows(
          listStudioUsageWindows(events, reportAsOf)
        );
        return [events, sessions, usageEvents, reportAsOf.toISOString()] as const;
      },
      ["funnel-events"],
      { revalidate: 60, tags: ["feedback-funnel"] }
    );

    const [cachedEvents, cachedSessions, cachedUsage, reportAsOf] = await cachedBuild(
      {
        workspaceId: filters.workspaceId,
        sessionId: filters.sessionId,
        from: filters.from,
        to: filters.to,
      },
      {
        workspaceId: filters.workspaceId,
        activeOnly: false,
      }
    );

    // Next caches JSON, so revive dates before passing rows to the aggregators.
    const events = cachedEvents.map((event) => ({ ...event, createdAt: new Date(event.createdAt) }));
    const sessions = cachedSessions.map((session) => ({ ...session, startedAt: new Date(session.startedAt) }));
    const usageEvents = cachedUsage.map((event) => ({ ...event, createdAt: new Date(event.createdAt) }));
    const filteredSessions = filters.sessionId
      ? sessions.filter((session) => session.id === filters.sessionId)
      : sessions;
    const selectedFromDatabase = filters.workspaceId
      ? await listSelectedCreativeWorkPieceVersions(filters.workspaceId)
      : undefined;
    const summary = buildAnalyticsFunnelSummary(
      events,
      filteredSessions,
      usageEvents,
      new Date(reportAsOf),
      { selectedFromDatabase },
    );

    return NextResponse.json({
      filters: {
        workspaceId: filters.workspaceId ?? null,
        sessionId: filters.sessionId ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      dataComplete: events.length < OWNER_ANALYTICS_EVENT_CAP,
      ...summary,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "feedback.analytics.funnel.GET");
  }
}
