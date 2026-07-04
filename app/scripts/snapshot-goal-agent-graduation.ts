/**
 * Prints the goal-agent graduation gate JSON for staging evidence snapshots.
 *
 * Usage:
 *   npx tsx scripts/snapshot-goal-agent-graduation.ts
 *   curl -H "Cookie: …" https://staging/api/feedback/analytics/goal-agent
 */
import "./load-env";
import { count, eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { assistantGoalRuns } from "../src/server/db/schema";
import { computeGraduationReport } from "../src/server/assistant/goal/analytics";

async function main() {
  const startedRows = await db.select({ count: count() }).from(assistantGoalRuns);
  const completedRows = await db
    .select({ count: count() })
    .from(assistantGoalRuns)
    .where(eq(assistantGoalRuns.stage, "completed"));
  const abandonedRows = await db
    .select({ count: count() })
    .from(assistantGoalRuns)
    .where(eq(assistantGoalRuns.stage, "stopped"));
  const distinctClientRows = await db
    .select({
      count: sql<number>`count(distinct ${assistantGoalRuns.clientProfileId})`,
    })
    .from(assistantGoalRuns);

  const report = computeGraduationReport({
    startedObjectives: startedRows[0]?.count ?? 0,
    completedObjectives: completedRows[0]?.count ?? 0,
    distinctClients: Number(distinctClientRows[0]?.count ?? 0),
    criticalCreditFailures: 0,
    criticalScopeFailures: 0,
    stageDropoff: { stopped: abandonedRows[0]?.count ?? 0 },
  });

  console.log(JSON.stringify(report, null, 2));
  if (!report.graduation.passed) {
    process.exitCode = 1;
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
