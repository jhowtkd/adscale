import { describe, expect, it } from "vitest";
import {
  hasReachedValueMoment,
  shouldShowUpgradePrompt,
} from "./credit-activation";

describe("credit activation upgrade gating", () => {
  it("does not prompt before value moment", () => {
    expect(
      shouldShowUpgradePrompt({
        completedMissionKeys: ["setup", "upload"],
        activeMissionKey: "preview",
        remainingCredits: 0,
        activeMissionCreditCost: 5,
        creditAccessExhausted: true,
      })
    ).toBe(false);
  });

  it("prompts on clear insufficiency after readiness", () => {
    expect(
      shouldShowUpgradePrompt({
        completedMissionKeys: ["setup", "upload", "readiness"],
        activeMissionKey: "preview",
        remainingCredits: 2,
        activeMissionCreditCost: 5,
        creditAccessExhausted: false,
      })
    ).toBe(true);
  });

  it("prompts when beta allowance exhausted after preview value", () => {
    expect(
      shouldShowUpgradePrompt({
        completedMissionKeys: ["setup", "upload", "readiness", "preview"],
        activeMissionKey: "batch",
        remainingCredits: 0,
        activeMissionCreditCost: 15,
        creditAccessExhausted: true,
      })
    ).toBe(true);
  });

  it("does not prompt with healthy balance before preview", () => {
    expect(
      shouldShowUpgradePrompt({
        completedMissionKeys: ["setup", "upload", "readiness"],
        activeMissionKey: "strategy_recipe",
        remainingCredits: 50,
        activeMissionCreditCost: null,
        creditAccessExhausted: false,
      })
    ).toBe(false);
  });

  it("tracks value moments from readiness onward", () => {
    expect(hasReachedValueMoment(["setup", "upload"])).toBe(false);
    expect(hasReachedValueMoment(["setup", "readiness"])).toBe(true);
  });
});
