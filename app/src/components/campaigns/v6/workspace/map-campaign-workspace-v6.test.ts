import { describe, expect, it } from "vitest";
import { resolveWorkspaceStage } from "./map-campaign-workspace-v6";

const baseCtx = {
  workspaceState: "trabalho" as const,
  derivationCount: 3,
  reviewCount: 0,
  approvedCount: 0,
};

describe("resolveWorkspaceStage", () => {
  it("returns 1 (Prepare) during setup regardless of generation", () => {
    expect(
      resolveWorkspaceStage({ ...baseCtx, workspaceState: "setup", isGenerating: true }),
    ).toBe(1);
  });

  it("stays on Generate (2) while generation is active", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, isGenerating: true })).toBe(2);
  });

  it("stays on Generate (2) while reviewing before any approval", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, reviewCount: 1 })).toBe(2);
    expect(resolveWorkspaceStage({ ...baseCtx, derivationCount: 1 })).toBe(2);
    expect(resolveWorkspaceStage({ ...baseCtx, derivationCount: 0 })).toBe(2);
  });

  it("advances to Deliver (3) once something is approved and not generating", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, approvedCount: 1 })).toBe(3);
  });

  it("keeps Generate (2) while generating even if approvals already exist", () => {
    expect(
      resolveWorkspaceStage({
        ...baseCtx,
        approvedCount: 1,
        isGenerating: true,
      }),
    ).toBe(2);
  });
});
