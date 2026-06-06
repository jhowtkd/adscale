import type { WorkspaceMissionsResponse } from "@/lib/progression/missions/types";
import { inferWorkspaceEvidence } from "../evidence";
import { inferMissionCompletions } from "./evidence";
import {
  buildMissionStatuses,
  calculateMissionProgressPercent,
  findActiveMissionKey,
} from "./status";
import { MISSION_ORDER } from "./definitions";

export async function getWorkspaceMissions(
  workspaceId: string
): Promise<WorkspaceMissionsResponse> {
  const context = await inferWorkspaceEvidence(workspaceId);
  const completions = await inferMissionCompletions(workspaceId, context);
  const missions = buildMissionStatuses(completions, context);
  const completedCount = missions.filter((mission) => mission.status === "completed").length;
  const lastCalculatedAt = new Date();

  return {
    missions,
    activeMissionKey: findActiveMissionKey(missions),
    completedCount,
    totalCount: MISSION_ORDER.length,
    progressPercent: calculateMissionProgressPercent(missions),
    lastCalculatedAt: lastCalculatedAt.toISOString(),
  };
}
