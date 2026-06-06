import type {
  MissionItem,
  WorkspaceMissionsResponse,
} from "@/lib/progression/missions/types";
import { shouldShowUpgradePrompt } from "@/lib/progression/credit-activation";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import { getAvailableCreditGrants } from "@/server/repositories/billing";
import { creditsToRemainingAds } from "@/server/billing/entitlements";
import { inferWorkspaceEvidence } from "../evidence";
import { inferMissionCompletions } from "./evidence";
import {
  buildMissionStatuses,
  calculateMissionProgressPercent,
  findActiveMissionKey,
} from "./status";
import { MISSION_ORDER } from "./definitions";
import {
  getMissionCreditEstimate,
  isCreditConsumingMission,
  missionHasInsufficientCredits,
} from "./credits";

function totalRemaining(grants: Array<{ remaining: number }>) {
  return grants.reduce((total, grant) => total + grant.remaining, 0);
}

function attachMissionCreditInfo(
  missions: MissionItem[],
  remainingCredits: number
): MissionItem[] {
  return missions.map((mission) => {
    if (!isCreditConsumingMission(mission.key)) {
      return mission;
    }
    const estimate = getMissionCreditEstimate(mission.key);
    if (!estimate) return mission;
    return {
      ...mission,
      credit: {
        creditCost: estimate.creditCost,
        adCost: estimate.adCost,
        costLabel: estimate.costLabel,
        insufficientCredits: missionHasInsufficientCredits(
          mission.key,
          remainingCredits
        ),
      },
    };
  });
}

export async function getWorkspaceMissions(
  workspaceId: string
): Promise<WorkspaceMissionsResponse> {
  const [context, access, grants] = await Promise.all([
    inferWorkspaceEvidence(workspaceId),
    getWorkspaceBillingAccess(workspaceId),
    getAvailableCreditGrants(workspaceId),
  ]);
  const completions = await inferMissionCompletions(workspaceId, context);
  const baseMissions = buildMissionStatuses(completions, context);
  const remainingCredits = totalRemaining(grants);
  const missions = attachMissionCreditInfo(baseMissions, remainingCredits);
  const completedCount = missions.filter((mission) => mission.status === "completed").length;
  const completedKeys = missions
    .filter((mission) => mission.status === "completed")
    .map((mission) => mission.key);
  const activeMissionKey = findActiveMissionKey(missions);
  const activeMission = missions.find((mission) => mission.key === activeMissionKey);
  const lastCalculatedAt = new Date();
  const creditAccessExhausted = remainingCredits <= 0;

  return {
    missions,
    activeMissionKey,
    completedCount,
    totalCount: MISSION_ORDER.length,
    progressPercent: calculateMissionProgressPercent(missions),
    lastCalculatedAt: lastCalculatedAt.toISOString(),
    creditContext: {
      remainingCredits,
      remainingAds: access.remainingAds ?? creditsToRemainingAds(remainingCredits),
      accessKind: access.kind,
      showUpgradePrompt: shouldShowUpgradePrompt({
        completedMissionKeys: completedKeys,
        activeMissionKey,
        remainingCredits,
        activeMissionCreditCost: activeMission?.credit?.creditCost ?? null,
        creditAccessExhausted,
      }),
    },
  };
}
