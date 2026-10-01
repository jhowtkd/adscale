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
  deleteWorkspaceAssetWithLogoReferences: vi.fn(),
  isBrandLogoKey: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  isWorkspaceAssetKey: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    delete: vi.fn(),
  },}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getWorkspaceAssetById,
  updateWorkspaceAsset,
  deleteWorkspaceAsset,
  deleteWorkspaceAssetWithLogoReferences,
  isBrandLogoKey,
} from "@/server/repositories/workspace-asset";
import { isWorkspaceAssetKey } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";

const mockGetWorkspaceAssetById = vi.mocked(getWorkspaceAssetById);
const mockUpdateWorkspaceAsset = vi.mocked(updateWorkspaceAsset);
const mockDeleteWorkspaceAsset = vi.mocked(deleteWorkspaceAsset);
const mockIsWorkspaceAssetKey = vi.mocked(isWorkspaceAssetKey);
const mockIsBrandLogoKey = vi.mocked(isBrandLogoKey);
const mockDeleteWithLogoReferences = vi.mocked(deleteWorkspaceAssetWithLogoReferences);
const mockDeleteObject = vi.mocked(objectStorage.delete);

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

  it.each([
    { handoffId: "handoff-of-another-brand" },
    { provisional: false },
    { provisional: true, handoffId: "handoff-1", caption: "ok" },
  ])("rejects a client change to the handoff ownership metadata: %j", async (metadata) => {
    mockGetWorkspaceAssetById.mockResolvedValue({ id: "wa-1", name: "old.png" } as Awaited<ReturnType<typeof getWorkspaceAssetById>>);

    const res = await PATCH(
      new Request("http://localhost/api/workspace/assets/wa-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      }),
      { params: makeParams("wa-1") }
    );

    // These fields decide which handoff may adopt the asset: only the server writes them.
    expect(res.status).toBe(400);
    expect(mockUpdateWorkspaceAsset).not.toHaveBeenCalled();
  });

  it("still accepts ordinary metadata", async () => {
    mockGetWorkspaceAssetById.mockResolvedValue({ id: "wa-1", name: "old.png" } as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockUpdateWorkspaceAsset.mockResolvedValue({ id: "wa-1" } as Awaited<ReturnType<typeof updateWorkspaceAsset>>);

    const res = await PATCH(
      new Request("http://localhost/api/workspace/assets/wa-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { caption: "Equipe no escritório" } }),
      }),
      { params: makeParams("wa-1") }
    );

    expect(res.status).toBe(200);
    expect(mockUpdateWorkspaceAsset).toHaveBeenCalledWith("wa-1", "workspace-1", expect.objectContaining({ metadata: { caption: "Equipe no escritório" } }));
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
    mockDeleteWithLogoReferences.mockResolvedValue(asset as Awaited<ReturnType<typeof deleteWorkspaceAssetWithLogoReferences>>);

    const res = await DELETE(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });

    // The row goes together with the logo references of its key (an old logo keeps one), and the
    // stored object only after that commit.
    expect(mockDeleteWithLogoReferences).toHaveBeenCalledWith("wa-1", "workspace-1");
    expect(mockDeleteWorkspaceAsset).not.toHaveBeenCalled();
    expect(mockDeleteObject).toHaveBeenCalledWith("key-1");
    expect(mockDeleteWithLogoReferences.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteObject.mock.invocationCallOrder[0]!);
    expect(res.status).toBe(204);
  });

  it("keeps the stored object when the database delete fails", async () => {
    const asset = { id: "wa-1", name: "logo.png", key: "key-1" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockIsWorkspaceAssetKey.mockResolvedValue(false);
    mockDeleteWithLogoReferences.mockRejectedValue(new Error("db down"));

    const res = await DELETE(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });

    // Nothing was committed, so the row and its references still need the file.
    expect(res.status).toBe(500);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("returns 409 when asset is in use", async () => {
    const asset = { id: "wa-1", name: "logo.png", key: "key-1" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockIsWorkspaceAssetKey.mockResolvedValue(true);

    const res = await DELETE(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });

    expect(res.status).toBe(409);
  });

  it("returns 409 when the asset is a brand's current logo, deleting neither the object nor the row", async () => {
    const asset = { id: "wa-1", name: "logo.png", key: "key-1" };
    mockGetWorkspaceAssetById.mockResolvedValue(asset as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockIsWorkspaceAssetKey.mockResolvedValue(false);
    mockIsBrandLogoKey.mockResolvedValue(true);

    const res = await DELETE(new Request("http://localhost/api/workspace/assets/wa-1"), { params: makeParams("wa-1") });

    // Deleting it would leave the Brand Kit pointing at a missing object.
    expect(res.status).toBe(409);
    expect(mockIsBrandLogoKey).toHaveBeenCalledWith("workspace-1", "key-1");
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockDeleteWithLogoReferences).not.toHaveBeenCalled();
  });
});
