import { describe, expect, it } from "vitest";

import { isSettingsTabEnabled, resolveSettingsTab } from "./settings-tabs";

describe("settings tab navigation", () => {
  it("defaults to the first enabled tab when no tab is requested", () => {
    expect(resolveSettingsTab(null)).toBe("brandKit");
  });

  it("keeps enabled tabs when requested", () => {
    expect(resolveSettingsTab("profile")).toBe("profile");
    expect(resolveSettingsTab("workspace")).toBe("workspace");
    expect(resolveSettingsTab("billing")).toBe("billing");
    expect(resolveSettingsTab("privacy")).toBe("privacy");
  });

  it("falls back to the first enabled tab for disabled tabs", () => {
    expect(resolveSettingsTab("integrations")).toBe("brandKit");
  });

  it("falls back for unknown tab ids", () => {
    expect(resolveSettingsTab("unknown")).toBe("brandKit");
  });

  it("tracks which tabs are enabled end-to-end", () => {
    expect(isSettingsTabEnabled("brandKit")).toBe(true);
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
