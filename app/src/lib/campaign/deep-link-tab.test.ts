import { describe, expect, it, vi } from "vitest";
import {
  applyCampaignDeepLink,
  parseCampaignTabParam,
} from "./deep-link-tab";

describe("parseCampaignTabParam", () => {
  it("accepts known tab keys", () => {
    expect(parseCampaignTabParam("readiness", null)).toEqual({ tab: "readiness" });
    expect(parseCampaignTabParam("review", "preview")).toEqual({
      tab: "review",
      mode: "preview",
    });
  });

  it("rejects unknown tabs", () => {
    expect(parseCampaignTabParam("invalid_mission", null)).toBeNull();
  });

  it("no longer accepts the recipe panel tabs (#790)", () => {
    expect(parseCampaignTabParam("recipe", null)).toBeNull();
    expect(parseCampaignTabParam("generate", "preview")).toBeNull();
  });
});

describe("applyCampaignDeepLink", () => {
  it("routes readiness to setup without Peças and to trabalho with them", () => {
    const goToSetup = vi.fn();
    const goToTrabalho = vi.fn();

    applyCampaignDeepLink("readiness", undefined, { goToSetup, goToTrabalho });
    expect(goToSetup).toHaveBeenCalled();
    expect(goToTrabalho).not.toHaveBeenCalled();

    goToSetup.mockClear();
    applyCampaignDeepLink("readiness", undefined, { goToSetup, goToTrabalho, hasDerivations: true });
    expect(goToTrabalho).toHaveBeenCalled();
    expect(goToSetup).not.toHaveBeenCalled();
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
