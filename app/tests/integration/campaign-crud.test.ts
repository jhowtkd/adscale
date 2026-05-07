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
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
} from "@/server/repositories/campaign";

describe("campaign CRUD with workspace isolation", () => {
  const workspaceA = "ws-a";

  it("creates a campaign in workspace A", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1", name: "Campaign A" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const campaign = await createCampaign(workspaceA, { name: "Campaign A" });

    expect(campaign).toEqual({ id: "camp-1", name: "Campaign A" });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: workspaceA, name: "Campaign A" })
    );
  });

  it("lists only campaigns in the requesting workspace", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([{ id: "camp-1", workspaceId: workspaceA }]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const campaigns = await getCampaigns(workspaceA);

    expect(campaigns.every((c) => c.workspaceId === workspaceA)).toBe(true);
  });

  it("does not find campaign from workspace B in workspace A", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const campaign = await getCampaignById("camp-from-b", workspaceA);

    expect(campaign).toBeNull();
  });

  it("updates a campaign in the correct workspace", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1", name: "Updated" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateCampaign("camp-1", workspaceA, { name: "Updated" });

    expect(updated).toEqual({ id: "camp-1", name: "Updated" });
    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
  });

  it("deletes a campaign in the correct workspace", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

    const deleted = await deleteCampaign("camp-1", workspaceA);

    expect(deleted).toEqual({ id: "camp-1" });
    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
  });

  it("passes styleIntensity when creating a campaign", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createCampaign(workspaceA, {
      name: "Restyling",
      generationMode: "restyling",
      styleIntensity: "strong",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ styleIntensity: "strong" })
    );
  });
});
