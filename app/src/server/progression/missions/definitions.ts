import type { MissionKey } from "@/lib/progression/missions/types";
import type { ProgressionEvidenceKey } from "@/lib/progression/types";

export const MISSION_ORDER: MissionKey[] = [
  "setup",
  "upload",
  "readiness",
  "guided_briefing",
  "strategy_recipe",
  "preview",
  "batch",
  "review",
  "regeneration",
  "export",
  "share",
];

export interface MissionDefinition {
  key: MissionKey;
  prerequisite?: MissionKey;
  /**
   * Structural blocked reason kept for backward compatibility with the API
   * response shape. Human-readable copy is resolved on the client via
   * `dashboard.missions.blockedReasons.<key>`.
   */
  blockedReason?: string;
  /** Maps to progression evidence when the mission aligns 1:1 */
  progressionEvidence?: ProgressionEvidenceKey;
}

export const MISSION_DEFINITIONS: Record<MissionKey, MissionDefinition> = {
  setup: {
    key: "setup",
    progressionEvidence: "campaign_created",
  },
  upload: {
    key: "upload",
    prerequisite: "setup",
    blockedReason: "",
    progressionEvidence: "base_creative_uploaded",
  },
  readiness: {
    key: "readiness",
    prerequisite: "upload",
    blockedReason: "",
    progressionEvidence: "readiness_ran",
  },
  guided_briefing: {
    key: "guided_briefing",
    prerequisite: "readiness",
    blockedReason: "",
  },
  strategy_recipe: {
    key: "strategy_recipe",
    prerequisite: "guided_briefing",
    blockedReason: "",
  },
  preview: {
    key: "preview",
    prerequisite: "strategy_recipe",
    blockedReason: "",
  },
  batch: {
    key: "batch",
    prerequisite: "preview",
    blockedReason: "",
  },
  review: {
    key: "review",
    prerequisite: "batch",
    blockedReason: "",
  },
  regeneration: {
    key: "regeneration",
    prerequisite: "review",
    blockedReason: "",
  },
  export: {
    key: "export",
    prerequisite: "review",
    blockedReason: "",
    progressionEvidence: "creative_exported",
  },
  share: {
    key: "share",
    prerequisite: "export",
    blockedReason: "",
    progressionEvidence: "share_created",
  },
};

export function getMissionDefinition(key: MissionKey): MissionDefinition {
  const definition = MISSION_DEFINITIONS[key];
  if (!definition) {
    throw new Error(`Unknown mission key: ${key}`);
  }
  return definition;
}
