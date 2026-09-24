import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { computeGraduationReport } from "@/server/assistant/goal/analytics";
import { db } from "@/server/db";
import { assistantGoalRuns } from "@/server/db/schema";
import { count, sql } from "drizzle-orm";

/**
 * Platform-owner-only pilot graduation report. Aggregates goal runs into the
 * scalar metrics the graduation gate checks (objective/client/completion counts
 * and critical failures). No message text, annotations, prompts, URLs, or
 * provider data ever enter this aggregation.
 */
export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);

    const [counts] = await db
      .select({
        started: count(),
        completed: sql<number>`count(*) filter (where ${assistantGoalRuns.stage} = 'completed')::int`,
        stopped: sql<number>`count(*) filter (where ${assistantGoalRuns.stage} = 'stopped')::int`,
        clients: sql<number>`count(distinct ${assistantGoalRuns.clientProfileId})::int`,
      })
      .from(assistantGoalRuns);

    const report = computeGraduationReport({
      startedObjectives: counts?.started ?? 0,
      completedObjectives: counts?.completed ?? 0,
      distinctClients: counts?.clients ?? 0,
      // Critical failures are surfaced by the spend/scope telemetry in a later
      // wiring; the pilot defaults to zero until that feed is connected.
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: { stopped: counts?.stopped ?? 0 },
    });

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return apiError("forbidden", 403);
    }
    return handleApiError(error, "feedback.analytics.goal-agent.GET");
  }
}
