import type { MissionKey } from "@/lib/progression/missions/types";

export type MissionInsightMoment =
  | "readiness_first"
  | "preview_first"
  | "rejection_first"
  | "regeneration_first"
  | "export_first"
  | "share_first"
  | "mission_skipped"
  | "credit_friction";

export type MissionInsightSentiment = "positive" | "neutral" | "negative";

export type MissionInsightAction = "submitted" | "dismissed" | "skipped";

export type MissionInsightReason =
  | "clear_value"
  | "expected_more"
  | "confusing"
  | "too_slow"
  | "quality_issue"
  | "cost_concern"
  | "not_ready"
  | "wrong_timing"
  | "other";

export interface MissionInsightPayload {
  moment: MissionInsightMoment;
  missionKey: MissionKey;
  sentiment?: MissionInsightSentiment;
  reason?: MissionInsightReason;
  optionalText?: string;
  action: MissionInsightAction;
  campaignId?: string;
  derivationId?: string;
  route?: string;
  diagnosticContext?: Record<string, unknown>;
}

export interface MissionInsightPromptContext {
  moment: MissionInsightMoment;
  missionKey: MissionKey;
  campaignId?: string;
  derivationId?: string;
  route?: string;
  diagnosticContext?: Record<string, unknown>;
}

export const MOMENT_TO_MISSION: Record<MissionInsightMoment, MissionKey> = {
  readiness_first: "readiness",
  preview_first: "preview",
  rejection_first: "review",
  regeneration_first: "regeneration",
  export_first: "export",
  share_first: "share",
  mission_skipped: "setup",
  credit_friction: "preview",
};
