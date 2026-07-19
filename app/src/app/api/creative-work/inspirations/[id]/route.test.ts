import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: vi.fn(),
  getCuratedInspirationById: vi.fn(),
  getMaterializedCuratedInspiration: vi.fn(),
}));
vi.mock("@/server/storage", () => ({
  objectStorage: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { POST } from "./route";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createWorkspaceAsset,
  getCuratedInspirationById,
  getMaterializedCuratedInspiration,
} from "@/server/repositories/workspace-asset";
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
  });

  it("copies the global image into the user's workspace once", async () => {
    const response = await POST(
      new Request("http://localhost/api/creative-work/inspirations/curated-1", { method: "POST" }),
      { params: Promise.resolve({ id: "curated-1" }) },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ assetId: "asset-1" });
    expect(objectStorage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^workspaces\/workspace-1\/assets\//),
      Buffer.from("image"),
      "image/png",
    );
    expect(createWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      source: "curated_inspiration_copy",
      metadata: { curatedInspirationId: "curated-1" },
    }));
  });

  it("reuses a previously materialized asset", async () => {
    vi.mocked(getMaterializedCuratedInspiration).mockResolvedValue({ id: "asset-existing" } as never);

    const response = await POST(
      new Request("http://localhost/api/creative-work/inspirations/curated-1", { method: "POST" }),
      { params: Promise.resolve({ id: "curated-1" }) },
    );

    await expect(response.json()).resolves.toEqual({ assetId: "asset-existing" });
    expect(objectStorage.get).not.toHaveBeenCalled();
    expect(createWorkspaceAsset).not.toHaveBeenCalled();
  });
});
