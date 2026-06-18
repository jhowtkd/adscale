/**
 * Export beta feedback for triage.
 *
 * Usage:
 *   DATABASE_URL="<render internal url>" npx tsx scripts/export-beta-feedback.ts
 *   DATABASE_URL="..." npx tsx scripts/export-beta-feedback.ts --json > beta-feedback.json
 */
import "./load-env";
import { db } from "../src/server/db";
import { feedbackReports, betaSessions } from "../src/server/db/schema";
import { desc } from "drizzle-orm";
import { BETA_RUNBOOK_STAGES } from "../src/server/beta-sessions/types";

async function main() {
  const asJson = process.argv.includes("--json");

  const reports = await db
    .select({
      id: feedbackReports.id,
      status: feedbackReports.status,
      type: feedbackReports.type,
      severity: feedbackReports.severity,
      category: feedbackReports.category,
      message: feedbackReports.message,
      route: feedbackReports.route,
      contextKind: feedbackReports.contextKind,
      campaignId: feedbackReports.campaignId,
      derivationId: feedbackReports.derivationId,
      internalNotes: feedbackReports.internalNotes,
      resolutionSummary: feedbackReports.resolutionSummary,
      createdAt: feedbackReports.createdAt,
    })
    .from(feedbackReports)
    .orderBy(desc(feedbackReports.createdAt))
    .limit(200);

  const sessions = await db
    .select({
      id: betaSessions.id,
      workspaceId: betaSessions.workspaceId,
      cohortLabel: betaSessions.cohortLabel,
      assistanceLevel: betaSessions.assistanceLevel,
      startedAt: betaSessions.startedAt,
      endedAt: betaSessions.endedAt,
      operatorNotes: betaSessions.operatorNotes,
    })
    .from(betaSessions)
    .orderBy(desc(betaSessions.startedAt))
    .limit(50);

  const payload = {
    exportedAt: new Date().toISOString(),
    feedbackReportCount: reports.length,
    betaSessionCount: sessions.length,
    openReports: reports.filter((r) => r.status === "new" || r.status === "reviewing"),
    reports,
    sessions: sessions.map((session) => ({
      ...session,
      stageNotes: BETA_RUNBOOK_STAGES.map((stage) => {
        const note = session.operatorNotes?.[stage];
        if (!note) return null;
        return { stage, ...note };
      }).filter(Boolean),
    })),
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# Beta feedback export (${payload.exportedAt})\n`);
  console.log(`Feedback reports: ${payload.feedbackReportCount}`);
  console.log(`Beta sessions: ${payload.betaSessionCount}\n`);

  if (reports.length === 0) {
    console.log("No feedback_reports rows in this database.\n");
  } else {
    console.log("## Feedback reports\n");
    for (const report of reports) {
      console.log(
        `- [${report.status}] ${report.severity}/${report.category} (${report.type}) — ${report.createdAt.toISOString()}`
      );
      console.log(`  id: ${report.id}`);
      if (report.route) console.log(`  route: ${report.route}`);
      console.log(`  message: ${report.message}`);
      if (report.internalNotes) console.log(`  internal: ${report.internalNotes}`);
      if (report.resolutionSummary) console.log(`  resolution: ${report.resolutionSummary}`);
      console.log("");
    }
  }

  if (sessions.length === 0) {
    console.log("No beta_sessions rows in this database.\n");
  } else {
    console.log("## Beta session operator notes\n");
    for (const session of payload.sessions) {
      console.log(
        `### Session ${session.id} (${session.cohortLabel ?? "no cohort"}) — ${session.startedAt.toISOString()}`
      );
      console.log(`workspace: ${session.workspaceId} | assistance: ${session.assistanceLevel}`);
      if (!session.stageNotes?.length) {
        console.log("  (no stage notes)\n");
        continue;
      }
      for (const stage of session.stageNotes) {
        console.log(`- **${stage.stage}**${stage.completedAt ? ` ✓ ${stage.completedAt}` : ""}`);
        if (stage.notes) console.log(`  notes: ${stage.notes}`);
        if (stage.tags?.length) console.log(`  tags: ${stage.tags.join(", ")}`);
        if (stage.blockerIds?.length) console.log(`  blockers: ${stage.blockerIds.join(", ")}`);
        if (stage.feedbackReportId) console.log(`  feedbackReportId: ${stage.feedbackReportId}`);
      }
      console.log("");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
