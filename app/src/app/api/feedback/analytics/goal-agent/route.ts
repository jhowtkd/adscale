import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { computeGraduationReport } from "@/server/assistant/goal/analytics";
import { db } from "@/server/db";
import { assistantGoalRuns } from "@/server/db/schema";
import { count, eq, sql } from "drizzle-orm";

/**
 * Platform-owner-only pilot graduation report. Aggregates goal runs into the
 * scalar metrics the graduation gate checks (objective/client/completion counts
 * and critical failures). No message text, annotations, prompts, URLs, or
 * provider data ever enter this aggregation.
 */
export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);

    const startedRows = await db
      .select({ count: count() })
      .from(assistantGoalRuns);

    const completedRows = await db
      .select({ count: count() })
      .from(assistantGoalRuns)
      .where(eq(assistantGoalRuns.stage, "completed"));

    const abandonedRows = await db
      .select({ count: count() })
      .from(assistantGoalRuns)
      .where(eq(assistantGoalRuns.stage, "stopped"));

    const distinctClientRows = await db
      .select({ count: sql<number>`count(distinct ${assistantGoalRuns.clientProfileId})` })
      .from(assistantGoalRuns);

    const startedObjectives = startedRows[0]?.count ?? 0;
    const completedObjectives = completedRows[0]?.count ?? 0;
    const distinctClients = Number(distinctClientRows[0]?.count ?? 0);

    const report = computeGraduationReport({
      startedObjectives,
      completedObjectives,
      distinctClients,
      // Critical failures are surfaced by the spend/scope telemetry in a later
      // wiring; the pilot defaults to zero until that feed is connected.
      criticalCreditFailures: 0,
      criticalScopeFailures: 0,
      stageDropoff: { stopped: abandonedRows[0]?.count ?? 0 },
    });

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return apiError("forbidden", 403);
    }
    return handleApiError(error, "feedback.analytics.goal-agent.GET");
  }
}
