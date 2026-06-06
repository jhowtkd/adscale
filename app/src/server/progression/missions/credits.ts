import type { MissionKey } from "@/lib/progression/missions/types";
import { CREDIT_COSTS } from "@/server/billing/credits";
import { BETA_AD_CREDIT_COST, creditsToRemainingAds } from "@/server/billing/entitlements";

/** Typical minimum batch size (3 CTA variants) for mission-path estimates. */
export const MISSION_BATCH_VARIANT_ESTIMATE = 3;

export interface MissionCreditEstimate {
  creditCost: number;
  adCost: number;
  /** Human label key suffix: "single" | "from" */
  costLabel: "single" | "from";
}

const CREDIT_MISSION_ESTIMATES: Partial<Record<MissionKey, MissionCreditEstimate>> = {
  preview: {
    creditCost: CREDIT_COSTS.image_derivation,
    adCost: creditsToRemainingAds(CREDIT_COSTS.image_derivation),
    costLabel: "single",
  },
  batch: {
    creditCost: CREDIT_COSTS.image_derivation * MISSION_BATCH_VARIANT_ESTIMATE,
    adCost: creditsToRemainingAds(
      CREDIT_COSTS.image_derivation * MISSION_BATCH_VARIANT_ESTIMATE
    ),
    costLabel: "from",
  },
  regeneration: {
    creditCost: CREDIT_COSTS.regeneration,
    adCost: creditsToRemainingAds(CREDIT_COSTS.regeneration),
    costLabel: "single",
  },
};

export function isCreditConsumingMission(key: MissionKey): boolean {
  return key in CREDIT_MISSION_ESTIMATES;
}

export function getMissionCreditEstimate(key: MissionKey): MissionCreditEstimate | null {
  return CREDIT_MISSION_ESTIMATES[key] ?? null;
}

export function missionHasInsufficientCredits(
  key: MissionKey,
  remainingCredits: number
): boolean {
  const estimate = getMissionCreditEstimate(key);
  if (!estimate) return false;
  return remainingCredits < estimate.creditCost;
}

export { BETA_AD_CREDIT_COST };
