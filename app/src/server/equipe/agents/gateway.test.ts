// LiveAdscaleGateway: every method stays inside the construction workspace.

import { describe, expect, it, vi } from "vitest";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getCreativeWorkOutputInWorkspace } from "@/server/repositories/creative-work";
import { getAssetIdsVisibleToBrand, getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { LiveAdscaleGateway } from "./gateway";

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));
vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  getCreativeWorkOutputInWorkspace: vi.fn(),
}));
vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
  getAssetIdsVisibleToBrand: vi.fn(),
}));

const stubProfile = vi.mocked(getClientProfile);
const stubOutput = vi.mocked(getCreativeWorkOutputInWorkspace);
const stubAsset = vi.mocked(getWorkspaceAssetById);
const stubVisible = vi.mocked(getAssetIdsVisibleToBrand);

describe("LiveAdscaleGateway", () => {
  it("refuses a client profile read for another workspace without hitting the repository", async () => {
    stubProfile.mockResolvedValue({ id: "profile-1", workspaceId: "workspace-other" } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getClientProfile("workspace-other", "profile-1")).resolves.toBeNull();
    expect(stubProfile).not.toHaveBeenCalled();
  });

  it("reads a client profile inside its own workspace", async () => {
    stubProfile.mockResolvedValue({ id: "profile-1", workspaceId: "workspace-1" } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getClientProfile("workspace-1", "profile-1")).resolves.toEqual({
      id: "profile-1",
      workspaceId: "workspace-1",
      name: undefined,
      logoAssetKey: null,
      brandColors: [],
      brandFonts: [],
    });
    expect(stubProfile).toHaveBeenCalledWith("workspace-1", "profile-1");
  });

  it("reads the Brand Kit identity of a client profile; the untyped jsonb lists keep only their text entries (spec 2026-10-07 §3)", async () => {
    stubProfile.mockResolvedValue({
      id: "profile-1", workspaceId: "workspace-1", name: "CENBRAP", logoAssetKey: "logos/cenbrap.png",
      brandColors: ["#123456", "  ", 7, null, "#abcdef"], brandFonts: { not: "a list" },
    } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getClientProfile("workspace-1", "profile-1")).resolves.toEqual({
      id: "profile-1", workspaceId: "workspace-1", name: "CENBRAP",
      logoAssetKey: "logos/cenbrap.png", brandColors: ["#123456", "#abcdef"], brandFonts: [],
    });
  });

  it("reads an output with its work inside its own workspace", async () => {
    stubOutput.mockResolvedValue({
      id: "output-1",
      workspaceId: "workspace-1",
      workItemId: "work-1",
    } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getCreativeWorkOutput("output-1")).resolves.toEqual({
      id: "output-1",
      workspaceId: "workspace-1",
      workId: "work-1",
    });
    expect(stubOutput).toHaveBeenCalledWith("workspace-1", "output-1");
  });

  it("returns null for an unknown output", async () => {
    stubOutput.mockResolvedValue(null);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getCreativeWorkOutput("missing")).resolves.toBeNull();
  });

  it("reads an asset with its owner brand and metadata, so callers can check who it belongs to", async () => {
    stubAsset.mockResolvedValue({
      id: "asset-1", workspaceId: "workspace-1", type: "image/png", key: "workspaces/workspace-1/asset-1.png",
      clientProfileId: "brand-1", metadata: { provisional: true, handoffId: "handoff-1" },
    } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getAsset("asset-1")).resolves.toEqual({
      id: "asset-1", workspaceId: "workspace-1", kind: "image/png", key: "workspaces/workspace-1/asset-1.png",
      clientProfileId: "brand-1", metadata: { provisional: true, handoffId: "handoff-1" },
    });
    expect(stubAsset).toHaveBeenCalledWith("asset-1", "workspace-1");
  });

  it("hands out an asset for a brand only when that brand may see it in the Library", async () => {
    stubAsset.mockResolvedValue({ id: "asset-1", workspaceId: "workspace-1", type: "image/png", key: "k.png", clientProfileId: null, metadata: null } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");

    stubVisible.mockResolvedValue(["asset-1"]);
    await expect(gateway.getAssetForBrand("asset-1", "brand-1")).resolves.toMatchObject({ id: "asset-1", workspaceId: "workspace-1" });
    expect(stubVisible).toHaveBeenCalledWith("workspace-1", "brand-1", ["asset-1"]);

    stubVisible.mockResolvedValue([]);
    await expect(gateway.getAssetForBrand("asset-1", "brand-1")).resolves.toBeNull();
  });
});
