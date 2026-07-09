import { describe, expect, it } from "vitest";

import { isSettingsTabEnabled, resolveSettingsTab } from "./settings-tabs";

describe("settings tab navigation", () => {
  it("defaults to profile when no tab is requested", () => {
    expect(resolveSettingsTab(null)).toBe("profile");
  });

  it("keeps enabled tabs when requested", () => {
    expect(resolveSettingsTab("profile")).toBe("profile");
    expect(resolveSettingsTab("workspace")).toBe("workspace");
    expect(resolveSettingsTab("billing")).toBe("billing");
    expect(resolveSettingsTab("privacy")).toBe("privacy");
  });

  it("falls back to profile for disabled tabs", () => {
    expect(resolveSettingsTab("integrations")).toBe("profile");
  });

  it("falls back for unknown tab ids including legacy brand tabs", () => {
    expect(resolveSettingsTab("unknown")).toBe("profile");
    expect(resolveSettingsTab("brandKit")).toBe("profile");
    expect(resolveSettingsTab("brandTraining")).toBe("profile");
  });

  it("tracks which tabs are enabled end-to-end", () => {
    expect(isSettingsTabEnabled("brandKit")).toBe(false);
    expect(isSettingsTabEnabled("brandTraining")).toBe(false);
    expect(isSettingsTabEnabled("team")).toBe(true);
    expect(isSettingsTabEnabled("billing")).toBe(true);
    expect(isSettingsTabEnabled("creditHistory")).toBe(true);
    expect(isSettingsTabEnabled("plans")).toBe(true);
    expect(isSettingsTabEnabled("privacy")).toBe(true);

    expect(isSettingsTabEnabled("profile")).toBe(true);
    expect(isSettingsTabEnabled("workspace")).toBe(true);
    expect(isSettingsTabEnabled("integrations")).toBe(false);
  });
});
