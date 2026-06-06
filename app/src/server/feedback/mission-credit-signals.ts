import { listFeedbackReports } from "@/server/repositories/feedback";

const CREDIT_MISSION_KEYS = new Set(["preview", "batch", "regeneration"]);

export interface MissionCreditSignalSummary {
  healthyCount: number;
  frustrationCount: number;
  creditFrictionCount: number;
  skippedCreditMissionCount: number;
  positiveAfterSpendCount: number;
  recentExamples: Array<{
    id: string;
    signal: "healthy" | "frustration";
    moment: string;
    missionKey: string | null;
    sentiment: string | null;
    reason: string | null;
    createdAt: string;
  }>;
}

function diagnostic(report: { diagnosticContext: unknown }) {
  return (report.diagnosticContext ?? {}) as Record<string, unknown>;
}

function isMissionInsight(report: { diagnosticContext: unknown }) {
  return diagnostic(report).source === "mission_insight";
}

export function classifyMissionInsightSignal(report: {
  diagnosticContext: unknown;
}): "healthy" | "frustration" | null {
  if (!isMissionInsight(report)) return null;
  const ctx = diagnostic(report);
  const moment = String(ctx.moment ?? "");
  const sentiment = String(ctx.sentiment ?? "");
  const reason = String(ctx.reason ?? "");
  const missionKey = ctx.missionKey ? String(ctx.missionKey) : null;

  if (moment === "credit_friction") return "frustration";
  if (reason === "cost_concern") return "frustration";
  if (sentiment === "negative") return "frustration";
  if (
    moment === "mission_skipped" &&
    missionKey &&
    CREDIT_MISSION_KEYS.has(missionKey)
  ) {
    return "frustration";
  }

  if (sentiment === "positive") return "healthy";
  if (
    ["preview_first", "export_first", "share_first"].includes(moment) &&
    sentiment !== "negative"
  ) {
    return "healthy";
  }

  return null;
}

export async function summarizeMissionCreditSignals(): Promise<MissionCreditSignalSummary> {
  const reports = await listFeedbackReports({
    category: "mission",
    limit: 200,
  });

  let healthyCount = 0;
  let frustrationCount = 0;
  let creditFrictionCount = 0;
  let skippedCreditMissionCount = 0;
  let positiveAfterSpendCount = 0;
  const recentExamples: MissionCreditSignalSummary["recentExamples"] = [];

  for (const report of reports) {
    const ctx = diagnostic(report);
    const moment = String(ctx.moment ?? "");
    const missionKey = ctx.missionKey ? String(ctx.missionKey) : null;
    const sentiment = ctx.sentiment ? String(ctx.sentiment) : null;
    const reason = ctx.reason ? String(ctx.reason) : null;
    const signal = classifyMissionInsightSignal(report);

    if (moment === "credit_friction") creditFrictionCount += 1;
    if (
      moment === "mission_skipped" &&
      missionKey &&
      CREDIT_MISSION_KEYS.has(missionKey)
    ) {
      skippedCreditMissionCount += 1;
    }
    if (
      sentiment === "positive" &&
      ["preview_first", "batch", "regeneration"].some((key) =>
        moment.includes(key)
      )
    ) {
      positiveAfterSpendCount += 1;
    }

    if (signal === "healthy") healthyCount += 1;
    if (signal === "frustration") frustrationCount += 1;

    if (signal && recentExamples.length < 8) {
      recentExamples.push({
        id: report.id,
        signal,
        moment,
        missionKey,
        sentiment,
        reason,
        createdAt: report.createdAt?.toISOString() ?? new Date().toISOString(),
      });
    }
  }

  return {
    healthyCount,
    frustrationCount,
    creditFrictionCount,
    skippedCreditMissionCount,
    positiveAfterSpendCount,
    recentExamples,
  };
}
