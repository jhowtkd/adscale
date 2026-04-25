import { describe, it, expect, vi } from "vitest";

// Mock the DB module before importing the repository
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
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
} from "@/server/repositories/campaign";

describe("campaign repository", () => {
  const workspaceId = "ws-123";

  it("createCampaign inserts with workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await createCampaign(workspaceId, { name: "Test Campaign" });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, name: "Test Campaign" })
    );
    expect(result).toEqual({ id: "camp-1" });
  });

  it("getCampaigns filters by workspaceId", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getCampaigns(workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual([{ id: "camp-1" }]);
  });

  it("getCampaignById filters by id and workspaceId", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getCampaignById("camp-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "camp-1" });
  });

  it("updateCampaign filters by id and workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1", name: "Updated" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const result = await updateCampaign("camp-1", workspaceId, { name: "Updated" });

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "camp-1", name: "Updated" });
  });

  it("deleteCampaign filters by id and workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

    const result = await deleteCampaign("camp-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "camp-1" });
  });
});
