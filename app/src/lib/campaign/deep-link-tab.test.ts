import { describe, expect, it, vi } from "vitest";
import {
  applyCampaignDeepLink,
  parseCampaignTabParam,
} from "./deep-link-tab";

describe("parseCampaignTabParam", () => {
  it("accepts known tab keys", () => {
    expect(parseCampaignTabParam("readiness", null)).toEqual({ tab: "readiness" });
    expect(parseCampaignTabParam("generate", "preview")).toEqual({
      tab: "generate",
      mode: "preview",
    });
  });

  it("rejects unknown tabs", () => {
    expect(parseCampaignTabParam("invalid_mission", null)).toBeNull();
  });
});

describe("applyCampaignDeepLink", () => {
  it("routes readiness to pilot and generate preview to actions + recipe", () => {
    const goToPilot = vi.fn();
    const goToActions = vi.fn();
    const openStrategyRecipe = vi.fn();

    applyCampaignDeepLink("readiness", undefined, { goToPilot, goToActions });
    expect(goToPilot).toHaveBeenCalled();
    expect(goToActions).not.toHaveBeenCalled();

    applyCampaignDeepLink("generate", "preview", {
      goToPilot,
      goToActions,
      openStrategyRecipe,
    });
    expect(goToActions).toHaveBeenCalled();
    expect(openStrategyRecipe).toHaveBeenCalled();
  });
});
