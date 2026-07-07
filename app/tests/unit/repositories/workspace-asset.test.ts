import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  createWorkspaceAsset,
  getWorkspaceAssets,
  getWorkspaceAssetById,
  getWorkspaceAssetByKey,
  updateWorkspaceAsset,
  deleteWorkspaceAsset,
  isWorkspaceAssetKey,
} from "@/server/repositories/workspace-asset";

describe("workspace-asset repository", () => {
  const workspaceId = "ws-123";

  it("createWorkspaceAsset inserts with workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await createWorkspaceAsset({
      workspaceId,
      name: "logo.png",
      key: "workspaces/ws-123/assets/logo.png",
      type: "image/png",
      size: 1024,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, name: "logo.png", source: "upload" })
    );
    expect(result).toEqual({ id: "wa-1" });
  });

  it("getWorkspaceAssets filters by workspaceId", async () => {
    const mockOffset = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssets(workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual([{ id: "wa-1" }]);
  });

  it("getWorkspaceAssetById filters by id and workspaceId", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssetById("wa-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "wa-1" });
  });

  it("updateWorkspaceAsset updates fields and updatedAt", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: vi.fn().mockReturnValue({ where: mockWhere }) });

    const result = await updateWorkspaceAsset("wa-1", workspaceId, {
      name: "new-name.png",
      tags: ["logo", "brand"],
    });

    expect(result).toEqual({ id: "wa-1" });
  });

  it("deleteWorkspaceAsset filters by id and workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

    const result = await deleteWorkspaceAsset("wa-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "wa-1" });
  });

  it("isWorkspaceAssetKey returns true when key exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await isWorkspaceAssetKey(workspaceId, "key-123");

    expect(result).toBe(true);
  });

  it("createWorkspaceAsset persists metadata when provided", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-2" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const metadata = { hasAlpha: true, originalMimeType: "image/svg+xml" };

    await createWorkspaceAsset({
      workspaceId,
      name: "mark.svg",
      key: "workspaces/ws-123/brand-training/abc-mark.png",
      type: "image/png",
      size: 4096,
      source: "brand_training",
      metadata,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, metadata }),
    );
  });

  it("createWorkspaceAsset omits metadata when not provided", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-3" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createWorkspaceAsset({
      workspaceId,
      name: "logo.png",
      key: "workspaces/ws-123/assets/logo.png",
      type: "image/png",
      size: 1024,
    });

    const inserted = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty("metadata");
  });

  it("getWorkspaceAssetByKey filters by workspaceId and key", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssetByKey(
      workspaceId,
      "workspaces/ws-123/brand-training/abc-logo.png",
    );

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "wa-1" });
  });

  it("getWorkspaceAssetByKey returns null when no row matches", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssetByKey(
      workspaceId,
      "workspaces/ws-123/brand-training/missing.png",
    );

    expect(result).toBeNull();
  });
});
