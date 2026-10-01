import { beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: vi.fn(),
  getCuratedInspirationById: vi.fn(),
  getMaterializedCuratedInspiration: vi.fn(),
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  resolveBrandKitProfileId: vi.fn(),
}));
vi.mock("@/server/storage", () => ({
  objectStorage: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { POST } from "./route";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createWorkspaceAsset,
  getCuratedInspirationById,
  getMaterializedCuratedInspiration,
} from "@/server/repositories/workspace-asset";
import { resolveBrandKitProfileId } from "@/server/repositories/brand-kit";
import { objectStorage } from "@/server/storage";

describe("curated inspiration materialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({ workspace: { id: "workspace-1" } } as never);
    vi.mocked(getCuratedInspirationById).mockResolvedValue({
      id: "curated-1",
      key: "curated-inspirations/editorial.png",
      name: "Editorial.png",
      type: "image/png",
    } as never);
    vi.mocked(getMaterializedCuratedInspiration).mockResolvedValue(null);
    vi.mocked(objectStorage.get).mockResolvedValue(Buffer.from("image"));
    vi.mocked(createWorkspaceAsset).mockResolvedValue({ id: "asset-1" } as never);
    vi.mocked(resolveBrandKitProfileId).mockResolvedValue(PROFILE_ID);
  });

  it("copies the global image into the user's workspace once, tagged with the resolved brand", async () => {
    const response = await POST(
      new Request("http://localhost/api/creative-work/inspirations/curated-1", { method: "POST" }),
      { params: Promise.resolve({ id: "curated-1" }) },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ assetId: "asset-1" });
    expect(resolveBrandKitProfileId).toHaveBeenCalledWith("workspace-1", undefined);
    expect(getMaterializedCuratedInspiration).toHaveBeenCalledWith("workspace-1", "curated-1", PROFILE_ID);
    expect(objectStorage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^workspaces\/workspace-1\/assets\//),
      Buffer.from("image"),
      "image/png",
    );
    expect(createWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      // Ticket 07: every producer of workspace_assets tags the brand.
      clientProfileId: PROFILE_ID,
      source: "curated_inspiration_copy",
      metadata: { curatedInspirationId: "curated-1" },
    }));
  });

  it("reuses a previously materialized asset for the same brand", async () => {
    vi.mocked(getMaterializedCuratedInspiration).mockResolvedValue({ id: "asset-existing" } as never);

    const response = await POST(
      new Request("http://localhost/api/creative-work/inspirations/curated-1", { method: "POST" }),
      { params: Promise.resolve({ id: "curated-1" }) },
    );

    await expect(response.json()).resolves.toEqual({ assetId: "asset-existing" });
    expect(getMaterializedCuratedInspiration).toHaveBeenCalledWith("workspace-1", "curated-1", PROFILE_ID);
    expect(objectStorage.get).not.toHaveBeenCalled();
    expect(createWorkspaceAsset).not.toHaveBeenCalled();
  });

  it("rejects an invalid clientProfileId in the request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/creative-work/inspirations/curated-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientProfileId: "not-a-uuid" }),
      }),
      { params: Promise.resolve({ id: "curated-1" }) },
    );

    expect(response.status).toBe(400);
    expect(resolveBrandKitProfileId).not.toHaveBeenCalled();
    expect(createWorkspaceAsset).not.toHaveBeenCalled();
  });
});
