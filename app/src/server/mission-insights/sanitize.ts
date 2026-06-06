import { sanitizeDiagnosticContext } from "@/server/feedback/sanitize";
import { MISSION_DEFINITIONS } from "@/server/progression/missions/definitions";
import type {
  MissionInsightAction,
  MissionInsightMoment,
  MissionInsightReason,
  MissionInsightSentiment,
} from "@/lib/mission-insights/types";
import type { MissionKey } from "@/lib/progression/missions/types";

const ALLOWED_DIAGNOSTIC_KEYS = new Set([
  "readinessStatus",
  "derivationStatus",
  "isPreview",
  "creditError",
  "operation",
  "format",
  "qualityVerdict",
  "skippedMissionKey",
]);

const MOMENTS = new Set<MissionInsightMoment>([
  "readiness_first",
  "preview_first",
  "rejection_first",
  "regeneration_first",
  "export_first",
  "share_first",
  "mission_skipped",
  "credit_friction",
]);

const SENTIMENTS = new Set<MissionInsightSentiment>([
  "positive",
  "neutral",
  "negative",
]);

const ACTIONS = new Set<MissionInsightAction>(["submitted", "dismissed", "skipped"]);

const REASONS = new Set<MissionInsightReason>([
  "clear_value",
  "expected_more",
  "confusing",
  "too_slow",
  "quality_issue",
  "cost_concern",
  "not_ready",
  "wrong_timing",
  "other",
]);

const OPTIONAL_TEXT_MAX = 500;

const VALID_MISSION_KEYS = new Set<string>(Object.keys(MISSION_DEFINITIONS));

function pickAllowedDiagnostic(
  input: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!input) return {};
  const picked: Record<string, unknown> = {};
  for (const key of ALLOWED_DIAGNOSTIC_KEYS) {
    if (key in input) {
      picked[key] = input[key];
    }
  }
  return sanitizeDiagnosticContext(picked);
}

export function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= OPTIONAL_TEXT_MAX) return trimmed;
  return `${trimmed.slice(0, OPTIONAL_TEXT_MAX)}…`;
}

export interface SanitizedMissionInsight {
  moment: MissionInsightMoment;
  missionKey: MissionKey;
  sentiment?: MissionInsightSentiment;
  reason?: MissionInsightReason;
  optionalText?: string;
  action: MissionInsightAction;
  safeDiagnostic: Record<string, unknown>;
}

export function sanitizeMissionInsightInput(input: {
  moment: string;
  missionKey: string;
  sentiment?: string;
  reason?: string;
  optionalText?: string;
  action: string;
  diagnosticContext?: Record<string, unknown>;
}): SanitizedMissionInsight | null {
  if (!MOMENTS.has(input.moment as MissionInsightMoment)) return null;
  if (!ACTIONS.has(input.action as MissionInsightAction)) return null;

  const moment = input.moment as MissionInsightMoment;
  const action = input.action as MissionInsightAction;

  if (!VALID_MISSION_KEYS.has(input.missionKey)) {
    return null;
  }

  const missionKey = input.missionKey as MissionKey;

  let sentiment: MissionInsightSentiment | undefined;
  if (input.sentiment) {
    if (!SENTIMENTS.has(input.sentiment as MissionInsightSentiment)) return null;
    sentiment = input.sentiment as MissionInsightSentiment;
  }

  let reason: MissionInsightReason | undefined;
  if (input.reason) {
    if (!REASONS.has(input.reason as MissionInsightReason)) return null;
    reason = input.reason as MissionInsightReason;
  }

  if (action === "submitted" && (!sentiment || !reason)) {
    return null;
  }

  return {
    moment,
    missionKey,
    sentiment,
    reason,
    optionalText: sanitizeOptionalText(input.optionalText),
    action,
    safeDiagnostic: pickAllowedDiagnostic(input.diagnosticContext),
  };
}

export function buildMissionInsightDiagnosticContext(
  insight: SanitizedMissionInsight
): Record<string, unknown> {
  return sanitizeDiagnosticContext({
    source: "mission_insight",
    moment: insight.moment,
    missionKey: insight.missionKey,
    sentiment: insight.sentiment,
    reason: insight.reason,
    action: insight.action,
    ...insight.safeDiagnostic,
  });
}
