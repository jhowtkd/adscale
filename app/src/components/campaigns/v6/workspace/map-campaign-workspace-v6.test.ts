import { describe, expect, it } from "vitest";
import {
  mapCampaignWorkspaceToV6View,
  resolveWorkspaceStage,
} from "./map-campaign-workspace-v6";

const baseCtx = {
  workspaceState: "trabalho" as const,
  derivationCount: 3,
  approvedCount: 0,
};

describe("resolveWorkspaceStage", () => {
  it("returns 1 (Briefing) during setup regardless of generation", () => {
    expect(
      resolveWorkspaceStage({ ...baseCtx, workspaceState: "setup", isGenerating: true }),
    ).toBe(1);
  });

  it("stays on Produce (2) while generation is active", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, isGenerating: true })).toBe(2);
  });

  it("moves to Review (3) when derivations exist and nothing approved", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, derivationCount: 1 })).toBe(3);
  });

  it("stays on Produce (2) with empty trabalho surface", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, derivationCount: 0 })).toBe(2);
  });

  it("advances to Deliver (4) once something is approved and not generating", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, approvedCount: 1 })).toBe(4);
  });

  it("keeps Produce (2) while generating even if approvals already exist", () => {
    expect(
      resolveWorkspaceStage({
        ...baseCtx,
        approvedCount: 1,
        isGenerating: true,
      }),
    ).toBe(2);
  });
});

describe("mapCampaignWorkspaceToV6View", () => {
  it("keeps failed campaigns dangerous while generating campaigns stay warning", () => {
    const mapStatus = (status: "failed" | "generating") =>
      mapCampaignWorkspaceToV6View({
        campaign: {
          name: "Campaign",
          status,
          createdAt: new Date("2026-07-13T12:00:00.000Z"),
        },
        derivations: [],
        workspaceState: "trabalho",
        tStatus: (value) => value,
        tWorkspace: (value) => value,
        formatDate: () => "today",
      }).statusVariant;

    expect(mapStatus("failed")).toBe("danger");
    expect(mapStatus("generating")).toBe("warning");
  });
});
