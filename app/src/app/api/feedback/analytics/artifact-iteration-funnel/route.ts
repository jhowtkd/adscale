import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { buildArtifactIterationFunnelSummary } from "@/server/assistant/artifact-iteration-funnel";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listArtifactIterationTelemetryEventsForOwner } from "@/server/repositories/artifact-iteration-telemetry";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const events = await listArtifactIterationTelemetryEventsForOwner({
      workspaceId: filters.workspaceId,
      from: filters.from,
      to: filters.to,
    });

    const summary = buildArtifactIterationFunnelSummary(events);

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
    return handleApiError(error, "feedback.analytics.artifact-iteration-funnel.GET");
  }
}
