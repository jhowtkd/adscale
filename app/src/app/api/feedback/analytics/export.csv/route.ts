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
import { listSelectedCreativeWorkPieceVersions } from "@/server/repositories/selected-piece-versions";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const [events, sessions, selectedFromDatabase] = await Promise.all([
      listBetaAnalyticsEventsForOwner({
        workspaceId: filters.workspaceId,
        sessionId: filters.sessionId,
        from: filters.from,
        to: filters.to,
      }),
      listBetaSessions({
        workspaceId: filters.workspaceId,
        activeOnly: false,
      }),
      filters.workspaceId
        ? listSelectedCreativeWorkPieceVersions(filters.workspaceId)
        : Promise.resolve(undefined),
    ]);
    const filteredSessions = filters.sessionId
      ? sessions.filter((session) => session.id === filters.sessionId)
      : sessions;

    const summary = buildAnalyticsFunnelSummary(
      events,
      filteredSessions,
      [],
      filters.to,
      { selectedFromDatabase },
    );
    const eventCsv = eventsToCsvRows(events);
    const reconcile = summary.valueDelivered.reconcile;

    const summaryLines = [
      "# funnel_summary",
      `events,${summary.totals.events}`,
      `sessions,${summary.totals.sessions}`,
      "",
      "# value_delivered",
      `selected_pieces,${summary.valueDelivered.selectedPieces}`,
      `delivered_pieces,${summary.valueDelivered.deliveredPieces}`,
      ...(reconcile
        ? [
            `reconcile_database,${reconcile.selectedFromDatabase}`,
            `reconcile_events,${reconcile.selectedFromEvents}`,
            `reconcile_missing_from_events,${reconcile.missingFromEvents}`,
            `reconcile_orphaned_from_events,${reconcile.orphanedFromEvents}`,
          ]
        : ["reconcile,workspace_filter_required"]),
      "",
      "# value_delivered_by_origin",
      "origin,selected_pieces,delivered_pieces",
      ...summary.valueDelivered.byOrigin.map(
        (row) => `${row.origin},${row.selectedPieces},${row.deliveredPieces}`
      ),
      "",
      "# value_delivered_by_protocol",
      "protocol,selected_pieces,delivered_pieces",
      ...summary.valueDelivered.byProtocol.map(
        (row) => `${row.protocol},${row.selectedPieces},${row.deliveredPieces}`
      ),
      "",
      "# value_delivered_weeks",
      "workspace_id,week_start,selected_pieces,delivered_pieces",
      ...summary.valueDelivered.weeks.map(
        (row) => `${row.workspaceId},${row.weekStart},${row.selectedPieces},${row.deliveredPieces}`
      ),
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
