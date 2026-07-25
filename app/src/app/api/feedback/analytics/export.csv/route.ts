import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  buildAnalyticsFunnelSummary,
  eventsToCsvRows,
} from "@/server/beta-analytics/aggregate";
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
    const eventCsv = eventsToCsvRows(events);

    const summaryLines = [
      "# funnel_summary",
      `events,${summary.totals.events}`,
      `sessions,${summary.totals.sessions}`,
      "",
      "# mission_funnel",
      "mission_key,entered,completed,conversion_rate",
      ...summary.missionFunnel.map(
        (row) =>
          `${row.missionKey},${row.entered},${row.completed},${row.conversionRate ?? ""}`
      ),
      "",
      "# cockpit_stage_funnel",
      "stage,entered,completed,abandoned",
      ...summary.cockpitStageFunnel.map(
        (row) =>
          `${row.stage},${row.entered},${row.completed},${row.abandoned}`
      ),
      "",
      "# derivation_auto_retry_funnel",
      "scope,triggered,succeeded,unchanged,success_rate",
      `overall,${summary.derivationAutoRetryFunnel.triggered},${summary.derivationAutoRetryFunnel.succeeded},${summary.derivationAutoRetryFunnel.unchanged},${summary.derivationAutoRetryFunnel.successRate ?? ""}`,
      ...summary.derivationAutoRetryFunnel.byGenerationMode.map(
        (row) =>
          `mode:${row.generationMode},${row.triggered},${row.succeeded},${row.unchanged},${row.successRate ?? ""}`
      ),
      ...summary.derivationAutoRetryFunnel.byFailureCode.map(
        (row) =>
          `failure:${row.reasonCode},${row.triggered},${row.succeeded},${row.unchanged},${row.successRate ?? ""}`
      ),
      "",
      "# credit_surprises_by_operation",
      "operation,surprise_count,total_delta,max_abs_delta",
      ...summary.creditSurprisesByOperation.map(
        (row) =>
          `${row.operation},${row.surpriseCount},${row.totalDelta},${row.maxAbsDelta}`
      ),
      "",
      "# session_stage_timeline",
      "session_id,stage,completed_at,gap_from_previous_ms",
      ...summary.sessionStageTimeline.map(
        (row) =>
          `${row.sessionId},${row.stage},${row.completedAt},${row.gapFromPreviousMs ?? ""}`
      ),
      "",
      "# events",
    ];

    const body = [...summaryLines, eventCsv].join("\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="beta-analytics-export.csv"',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "feedback.analytics.export.csv.GET");
  }
}
