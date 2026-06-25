import { describe, expect, it } from "vitest";
import {
  isFixtureSeedProfileName,
  selectLiveCorpusTarget,
} from "@/server/human-quality/live-corpus-target";

describe("live-corpus-target", () => {
  it("treats Cenbrap as fixture/seed profile name", () => {
    expect(isFixtureSeedProfileName("Cenbrap")).toBe(true);
    expect(isFixtureSeedProfileName("cenbrap calibration")).toBe(true);
    expect(isFixtureSeedProfileName("Outra Marca")).toBe(false);
    expect(isFixtureSeedProfileName("Live Evidence Brand")).toBe(false);
  });

  it("selects first non-fixture profile by name", () => {
    const profiles = [
      { id: "p-cenbrap", name: "Cenbrap", workspaceId: "ws-1" },
      { id: "p-other", name: "Outra Marca", workspaceId: "ws-1" },
    ];
    expect(selectLiveCorpusTarget(profiles)?.id).toBe("p-other");
  });

  it("returns null when only fixture profiles exist", () => {
    const profiles = [
      { id: "p-cenbrap", name: "Cenbrap", workspaceId: "ws-1" },
    ];
    expect(selectLiveCorpusTarget(profiles)).toBeNull();
  });
});
