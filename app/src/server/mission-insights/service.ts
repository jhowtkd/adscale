import { createFeedbackReport } from "@/server/repositories/feedback";
import {
  buildMissionInsightDiagnosticContext,
  type SanitizedMissionInsight,
} from "./sanitize";

function buildInsightMessage(insight: SanitizedMissionInsight): string {
  const parts = [
    `[mission:${insight.moment}]`,
    `mission=${insight.missionKey}`,
    `action=${insight.action}`,
  ];
  if (insight.sentiment) parts.push(`sentiment=${insight.sentiment}`);
  if (insight.reason) parts.push(`reason=${insight.reason}`);
  if (insight.optionalText) parts.push(`note=${insight.optionalText}`);
  return parts.join(" ");
}

export async function recordMissionInsight(input: {
  workspaceId: string;
  userId: string;
  insight: SanitizedMissionInsight;
  route?: string;
  campaignId?: string | null;
  derivationId?: string | null;
}) {
  const { insight, workspaceId, userId, route, campaignId, derivationId } = input;
  const diagnosticContext = buildMissionInsightDiagnosticContext(insight);

  const severity =
    insight.action === "submitted" && insight.sentiment === "negative"
      ? "medium"
      : insight.moment === "credit_friction"
        ? "medium"
        : "low";

  return createFeedbackReport({
    workspaceId,
    userId,
    type: "other",
    severity,
    category: "mission",
    message: buildInsightMessage(insight),
    followUpAllowed: false,
    route,
    contextKind: derivationId ? "derivation" : campaignId ? "campaign" : "global",
    campaignId: campaignId ?? null,
    derivationId: derivationId ?? null,
    diagnosticContext,
    contextCompleteness: {
      missionMoment: true,
      missionKey: true,
      sentiment: Boolean(insight.sentiment),
      reason: Boolean(insight.reason),
      optionalText: Boolean(insight.optionalText),
    },
  });
}
