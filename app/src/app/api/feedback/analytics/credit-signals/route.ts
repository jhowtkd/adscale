import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { summarizeOwnerCreditSignals } from "@/server/beta-analytics/credit-signals";
import { parseOwnerAnalyticsQuery } from "@/server/beta-analytics/query";
import { listBetaAnalyticsEventsForOwner } from "@/server/repositories/beta-analytics";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const filters = parseOwnerAnalyticsQuery(searchParams);

    const cachedEvents = unstable_cache(
      async (args: Parameters<typeof listBetaAnalyticsEventsForOwner>[0]) =>
        listBetaAnalyticsEventsForOwner(args),
      ["credit-signals-events"],
      { revalidate: 60, tags: ["feedback-credit-signals"] }
    );
    const events = await cachedEvents({
      workspaceId: filters.workspaceId,
      sessionId: filters.sessionId,
      from: filters.from,
      to: filters.to,
    });

    const summary = await summarizeOwnerCreditSignals(events);

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
    return handleApiError(error, "feedback.analytics.credit-signals.GET");
  }
}
