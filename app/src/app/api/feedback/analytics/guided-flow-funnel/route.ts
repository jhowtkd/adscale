import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { buildGuidedFlowFunnelSummary } from "@/server/assistant/guided-flow-funnel";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listGuidedFlowTelemetryEventsForOwner } from "@/server/repositories/guided-flow-telemetry";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const events = await listGuidedFlowTelemetryEventsForOwner({
      workspaceId: filters.workspaceId,
      from: filters.from,
      to: filters.to,
    });

    const summary = buildGuidedFlowFunnelSummary(events);

    return NextResponse.json({
      filters: {
        workspaceId: filters.workspaceId ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      ...summary,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "feedback.analytics.guided-flow-funnel.GET");
  }
}
