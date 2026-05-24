import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PATCH, DELETE } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
  updateWorkspaceAsset: vi.fn(),
  deleteWorkspaceAsset: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  isWorkspaceAssetKey: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  deleteObject: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getWorkspaceAssetById,
  updateWorkspaceAsset,
  deleteWorkspaceAsset,
} from "@/server/repositories/workspace-asset";
import { isWorkspaceAssetKey } from "@/server/repositories/asset";
import { deleteObject } from "@/server/storage/r2";

const mockGetWorkspaceAssetById = vi.mocked(getWorkspaceAssetById);
const mockUpdateWorkspaceAsset = vi.mocked(updateWorkspaceAsset);
const mockDeleteWorkspaceAsset = vi.mocked(deleteWorkspaceAsset);
const mockIsWorkspaceAssetKey = vi.mocked(isWorkspaceAssetKey);
const mockDeleteObject = vi.mocked(deleteObject);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

describe("GET /api/workspace/assets/[id]", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns asset by id", async () => {
    const asset = { id: "wa-1", name: "logo.png", workspaceId: "workspace-1" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);

    const res = await GET(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.asset).toEqual(asset);
  });

  it("returns 404 for missing asset", async () => {
    mockGetWorkspaceAssetById.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/workspace/assets/wa-999"), { params: makeParams("wa-999") });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/workspace/assets/[id]", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("updates asset name and tags", async () => {
    const asset = { id: "wa-1", name: "old.png" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockUpdateWorkspaceAsset.mockResolvedValue({ id: "wa-1", name: "new.png", tags: ["logo"] } as Awaited<ReturnType<typeof updateWorkspaceAsset>>);

    const res = await PATCH(
      new Request("http://localhost/api/workspace/assets/wa-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "new.png", tags: ["logo"] }),
      }),
      { params: makeParams("wa-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.asset.name).toBe("new.png");
  });

  it("rejects invalid name", async () => {
    const asset = { id: "wa-1", name: "old.png" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);

    const res = await PATCH(
      new Request("http://localhost/api/workspace/assets/wa-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: makeParams("wa-1") }
    );

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/workspace/assets/[id]", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("deletes asset when not in use", async () => {
    const asset = { id: "wa-1", name: "logo.png", key: "key-1" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockIsWorkspaceAssetKey.mockResolvedValue(false);
    mockDeleteObject.mockResolvedValue(undefined);
    mockDeleteWorkspaceAsset.mockResolvedValue(asset as Awaited<ReturnType<typeof deleteWorkspaceAsset>>);

    const res = await DELETE(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });

    expect(mockDeleteObject).toHaveBeenCalledWith("key-1");
    expect(mockDeleteWorkspaceAsset).toHaveBeenCalledWith("wa-1", "workspace-1");
    expect(res.status).toBe(204);
  });

  it("returns 409 when asset is in use", async () => {
    const asset = { id: "wa-1", name: "logo.png", key: "key-1" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockIsWorkspaceAssetKey.mockResolvedValue(true);

    const res = await DELETE(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });

    expect(res.status).toBe(409);
  });
});
