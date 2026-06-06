import type { MissionKey } from "@/lib/progression/missions/types";
import { BETA_AD_CREDIT_COST } from "@/server/billing/entitlements";

/** Missions that prove the user understands workflow value before upgrade prompts. */
const VALUE_MOMENT_MISSIONS: MissionKey[] = [
  "readiness",
  "preview",
  "batch",
  "review",
  "export",
  "share",
];

export interface UpgradePromptInput {
  completedMissionKeys: MissionKey[];
  activeMissionKey: MissionKey | null;
  remainingCredits: number;
  activeMissionCreditCost: number | null;
  creditAccessExhausted: boolean;
}

export function hasReachedValueMoment(completedMissionKeys: MissionKey[]): boolean {
  return completedMissionKeys.some((key) => VALUE_MOMENT_MISSIONS.includes(key));
}

/**
 * CRED-03: upgrade/top-up only after value moments or clear insufficiency.
 * Never prompt before the user has completed readiness (understands the workflow).
 */
export function shouldShowUpgradePrompt(input: UpgradePromptInput): boolean {
  if (!hasReachedValueMoment(input.completedMissionKeys)) {
    return false;
  }

  if (
    input.activeMissionCreditCost !== null &&
    input.remainingCredits < input.activeMissionCreditCost
  ) {
    return true;
  }

  if (input.creditAccessExhausted) {
    return true;
  }

  if (
    input.completedMissionKeys.includes("preview") &&
    input.remainingCredits <= BETA_AD_CREDIT_COST
  ) {
    return true;
  }

  return false;
}
