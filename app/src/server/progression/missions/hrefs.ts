import type { MissionKey } from "@/lib/progression/missions/types";
import type { ProgressionEvidenceContext } from "../evidence";
import { buildEvidenceHref } from "../evidence";
import type { ProgressionEvidenceKey } from "@/lib/progression/types";

const MISSION_HREF_OVERRIDES: Partial<Record<MissionKey, string>> = {
  guided_briefing: "briefing",
  strategy_recipe: "recipe",
  preview: "generate",
  batch: "generate",
  review: "review",
  regeneration: "review",
};

const MISSION_TO_PROGRESSION: Partial<Record<MissionKey, ProgressionEvidenceKey>> = {
  setup: "campaign_created",
  upload: "base_creative_uploaded",
  readiness: "readiness_ran",
  export: "creative_exported",
  share: "share_created",
};

export function buildMissionHref(
  key: MissionKey,
  context: ProgressionEvidenceContext
): string {
  const campaignId = context.firstCampaignId;
  if (!campaignId) {
    return "/campaigns/new";
  }

  const progressionKey = MISSION_TO_PROGRESSION[key];
  if (progressionKey) {
    return buildEvidenceHref(progressionKey, context);
  }

  const tab = MISSION_HREF_OVERRIDES[key];
  if (tab) {
    const suffix = key === "preview" ? `${tab}&mode=preview` : tab;
    return `/campaigns/${campaignId}?tab=${suffix}`;
  }

  return `/campaigns/${campaignId}`;
}
