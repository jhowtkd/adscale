import type { MissionInsightMoment, MissionInsightReason } from "./types";

export const MISSION_INSIGHT_REASONS: Record<
  MissionInsightMoment,
  MissionInsightReason[]
> = {
  readiness_first: ["clear_value", "expected_more", "confusing", "quality_issue", "other"],
  preview_first: ["clear_value", "expected_more", "quality_issue", "cost_concern", "other"],
  rejection_first: ["quality_issue", "expected_more", "confusing", "other"],
  regeneration_first: ["clear_value", "expected_more", "too_slow", "quality_issue", "other"],
  export_first: ["clear_value", "expected_more", "confusing", "other"],
  share_first: ["clear_value", "expected_more", "confusing", "other"],
  mission_skipped: ["not_ready", "wrong_timing", "confusing", "cost_concern", "other"],
  credit_friction: ["cost_concern", "not_ready", "expected_more", "other"],
};
