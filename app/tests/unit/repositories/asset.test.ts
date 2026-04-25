import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  createAsset,
  getAssetsByCampaign,
  deleteAsset,
} from "@/server/repositories/asset";

describe("asset repository", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";

  it("createAsset inserts with workspaceId and campaignId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "asset-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await createAsset(workspaceId, campaignId, {
      key: "assets/123.png",
      type: "image/png",
      size: 1024,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, campaignId, key: "assets/123.png" })
    );
    expect(result).toEqual({ id: "asset-1" });
  });

  it("getAssetsByCampaign filters by campaignId and workspaceId", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([{ id: "asset-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getAssetsByCampaign(campaignId, workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual([{ id: "asset-1" }]);
  });

  it("deleteAsset filters by id and workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "asset-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

    const result = await deleteAsset("asset-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "asset-1" });
  });
});
