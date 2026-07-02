import { describe, expect, it } from "vitest";
import { resolveWorkspaceStage } from "./map-campaign-workspace-v6";

const baseCtx = {
  workspaceState: "trabalho" as const,
  derivationCount: 3,
  reviewCount: 0,
  approvedCount: 0,
};

describe("resolveWorkspaceStage", () => {
  it("returns 1 (Pilot) during setup regardless of generation", () => {
    expect(
      resolveWorkspaceStage({ ...baseCtx, workspaceState: "setup", isGenerating: true }),
    ).toBe(1);
  });

  it("stays on Derive (2) while generation is active, even with derivations present", () => {
    // During generation derivations are queued/processing: derivationCount > 0 but
    // nothing is reviewable/approved yet. Previously this fell through to Review (3).
    expect(
      resolveWorkspaceStage({ ...baseCtx, isGenerating: true }),
    ).toBe(2);
  });

  it("respects isGenerating even when review/approved counts would normally advance the stage", () => {
    expect(
      resolveWorkspaceStage({
        ...baseCtx,
        reviewCount: 1,
        approvedCount: 1,
        isGenerating: true,
      }),
    ).toBe(2);
  });

  it("falls back to progress-derived stage when not generating", () => {
    expect(resolveWorkspaceStage({ ...baseCtx, reviewCount: 1 })).toBe(3);
    expect(resolveWorkspaceStage({ ...baseCtx, approvedCount: 1 })).toBe(4);
    expect(resolveWorkspaceStage({ ...baseCtx, derivationCount: 1 })).toBe(3);
    expect(resolveWorkspaceStage({ ...baseCtx, derivationCount: 0 })).toBe(2);
  });
});
