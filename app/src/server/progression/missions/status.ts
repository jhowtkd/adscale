import type { MissionItem, MissionKey, MissionStatus } from "@/lib/progression/missions/types";
import { MISSION_ORDER } from "./definitions";
import {
  getMissionBlockedReason,
  isMissionPrerequisiteMet,
  type InferredMissionCompletion,
} from "./evidence";
import { buildMissionHref } from "./hrefs";
import type { ProgressionEvidenceContext } from "../evidence";

export function buildMissionStatuses(
  completions: InferredMissionCompletion[],
  context: ProgressionEvidenceContext
): MissionItem[] {
  const completionMap = new Map(
    completions.map((item) => [item.key, item] as const)
  );
  const completedKeys = new Set<MissionKey>(completions.map((item) => item.key));

  let activeAssigned = false;

  return MISSION_ORDER.map((key) => {
    const completion = completionMap.get(key);

    if (completion) {
      return {
        key,
        status: "completed" as MissionStatus,
        href: buildMissionHref(key, context),
        completedAt: completion.completedAt.toISOString(),
        evidenceId: completion.evidenceId,
        evidenceType: completion.evidenceType,
      };
    }

    const prerequisiteMet = isMissionPrerequisiteMet(key, completedKeys);
    if (!prerequisiteMet) {
      return {
        key,
        status: "blocked" as MissionStatus,
        href: buildMissionHref(key, context),
        blockedReason: getMissionBlockedReason(key),
      };
    }

    if (!activeAssigned) {
      activeAssigned = true;
      return {
        key,
        status: "active" as MissionStatus,
        href: buildMissionHref(key, context),
      };
    }

    return {
      key,
      status: "upcoming" as MissionStatus,
      href: buildMissionHref(key, context),
    };
  });
}

export function findActiveMissionKey(missions: MissionItem[]): MissionKey | null {
  return missions.find((mission) => mission.status === "active")?.key ?? null;
}

export function calculateMissionProgressPercent(missions: MissionItem[]): number {
  if (missions.length === 0) return 0;
  const completedCount = missions.filter((mission) => mission.status === "completed").length;
  return Math.round((completedCount / missions.length) * 100);
}
