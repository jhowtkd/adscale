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
        const [events, sessions, selectedFromDatabase] = await Promise.all([
          listBetaAnalyticsEventsForOwner(eventsArgs),
          listBetaSessions(sessionsArgs),
          eventsArgs?.workspaceId
            ? listSelectedCreativeWorkPieceVersions(eventsArgs.workspaceId)
            : Promise.resolve(undefined),
        ]);
        const reportAsOf = eventsArgs?.to ?? new Date();
        const usageEvents = await listStudioUsageEventsForWindows(
          listStudioUsageWindows(events, reportAsOf)
        );
        const filteredSessions = eventsArgs?.sessionId
          ? sessions.filter((session) => session.id === eventsArgs.sessionId)
          : sessions;
        // Next caches JSON; Date-backed rows must be aggregated before serialization.
        return {
          dataComplete: events.length < OWNER_ANALYTICS_EVENT_CAP,
          summary: buildAnalyticsFunnelSummary(
            events,
            filteredSessions,
            usageEvents,
            reportAsOf,
            { selectedFromDatabase },
          ),
        };
      },
      ["funnel-events"],
      { revalidate: 60, tags: ["feedback-funnel"] }
    );

    const { dataComplete, summary } = await cachedBuild(
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

    return NextResponse.json({
      filters: {
        workspaceId: filters.workspaceId ?? null,
        sessionId: filters.sessionId ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      dataComplete,
      ...summary,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "feedback.analytics.funnel.GET");
  }
}
