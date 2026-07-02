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
  it("routes readiness to setup and generate preview to trabalho + recipe", () => {
    const goToSetup = vi.fn();
    const goToTrabalho = vi.fn();
    const openStrategyRecipe = vi.fn();

    applyCampaignDeepLink("readiness", undefined, { goToSetup, goToTrabalho });
    expect(goToSetup).toHaveBeenCalled();
    expect(goToTrabalho).not.toHaveBeenCalled();

    applyCampaignDeepLink("generate", "preview", {
      goToSetup,
      goToTrabalho,
      openStrategyRecipe,
    });
    expect(goToTrabalho).toHaveBeenCalled();
    expect(openStrategyRecipe).toHaveBeenCalled();
  });

  it("routes review, export, and share to the trabalho surface", () => {
    const goToSetup = vi.fn();
    const goToTrabalho = vi.fn();

    for (const tab of ["review", "export", "share"] as const) {
      goToSetup.mockClear();
      goToTrabalho.mockClear();
      applyCampaignDeepLink(tab, undefined, { goToSetup, goToTrabalho });
      expect(goToTrabalho).toHaveBeenCalled();
      expect(goToSetup).not.toHaveBeenCalled();
    }
  });
});
