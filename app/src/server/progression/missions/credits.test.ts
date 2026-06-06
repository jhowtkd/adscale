import { describe, expect, it } from "vitest";
import {
  getMissionCreditEstimate,
  isCreditConsumingMission,
  missionHasInsufficientCredits,
  MISSION_BATCH_VARIANT_ESTIMATE,
} from "./credits";
import { CREDIT_COSTS } from "@/server/billing/credits";

describe("mission credit estimates", () => {
  it("marks preview, batch, and regeneration as credit-consuming", () => {
    expect(isCreditConsumingMission("preview")).toBe(true);
    expect(isCreditConsumingMission("batch")).toBe(true);
    expect(isCreditConsumingMission("regeneration")).toBe(true);
    expect(isCreditConsumingMission("setup")).toBe(false);
  });

  it("uses single derivation cost for preview", () => {
    const estimate = getMissionCreditEstimate("preview");
    expect(estimate).toEqual({
      creditCost: CREDIT_COSTS.image_derivation,
      adCost: 1,
      costLabel: "single",
    });
  });

  it("uses minimum batch estimate for batch mission", () => {
    const estimate = getMissionCreditEstimate("batch");
    expect(estimate?.creditCost).toBe(
      CREDIT_COSTS.image_derivation * MISSION_BATCH_VARIANT_ESTIMATE
    );
    expect(estimate?.costLabel).toBe("from");
  });

  it("detects insufficient credits for active mission", () => {
    expect(missionHasInsufficientCredits("preview", 4)).toBe(true);
    expect(missionHasInsufficientCredits("preview", 5)).toBe(false);
  });
});
