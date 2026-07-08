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
    const mockCampaignLimit = vi.fn().mockResolvedValue([
      { id: "camp-1", status: "draft" },
    ]);
    const mockCampaignOrderBy = vi.fn().mockReturnValue({ limit: mockCampaignLimit });
    const mockCampaignWhere = vi.fn().mockReturnValue({ orderBy: mockCampaignOrderBy });
    const mockCampaignFrom = vi.fn().mockReturnValue({ where: mockCampaignWhere });

    const mockMetricsGroupBy = vi.fn().mockResolvedValue([
      {
        campaignId: "camp-1",
        variations: 2,
        creditsUsed: 18,
        totalDerivations: 3,
        activeDerivations: 0,
        failedDerivations: 1,
        completedDerivations: 2,
      },
    ]);
    const mockMetricsWhere = vi.fn().mockReturnValue({ groupBy: mockMetricsGroupBy });
    const mockMetricsFrom = vi.fn().mockReturnValue({ where: mockMetricsWhere });

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ from: mockCampaignFrom })
      .mockReturnValueOnce({ from: mockMetricsFrom });

    const result = await getCampaigns(workspaceId);

    expect(mockMetricsWhere).toHaveBeenCalledWith(expect.anything());
    expect(mockCampaignWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual([
      {
        id: "camp-1",
        status: "completed",
        variations: 2,
        creditsUsed: 18,
        totalDerivations: 3,
        activeDerivations: 0,
        failedDerivations: 1,
        completedDerivations: 2,
        previewPendingBatch: false,
      },
    ]);
  });

  it("getCampaignById filters by id and workspaceId", async () => {
    const mockCampaignLimit = vi.fn().mockResolvedValue([
      { id: "camp-1", status: "draft" },
    ]);
    const mockCampaignWhere = vi.fn().mockReturnValue({ limit: mockCampaignLimit });
    const mockCampaignFrom = vi.fn().mockReturnValue({ where: mockCampaignWhere });

    const mockMetricsGroupBy = vi.fn().mockResolvedValue([
      {
        campaignId: "camp-1",
        variations: 0,
        creditsUsed: 0,
        totalDerivations: 1,
        activeDerivations: 1,
        failedDerivations: 0,
        completedDerivations: 0,
      },
    ]);
    const mockMetricsWhere = vi.fn().mockReturnValue({ groupBy: mockMetricsGroupBy });
    const mockMetricsFrom = vi.fn().mockReturnValue({ where: mockMetricsWhere });

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ from: mockMetricsFrom })
      .mockReturnValueOnce({ from: mockCampaignFrom });

    const result = await getCampaignById("camp-1", workspaceId);

    expect(mockMetricsWhere).toHaveBeenCalledWith(expect.anything());
    expect(mockCampaignWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({
      id: "camp-1",
      status: "generating",
      variations: 0,
      creditsUsed: 0,
      totalDerivations: 1,
      activeDerivations: 1,
      failedDerivations: 0,
      completedDerivations: 0,
      previewPendingBatch: false,
    });
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

  it("createCampaign defaults generationMode to art_variation", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createCampaign(workspaceId, { name: "Test Campaign" });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ generationMode: "art_variation" })
    );
  });

  it("createCampaign stores generationMode, ctaVariants, targetFormats", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createCampaign(workspaceId, {
      name: "Test Campaign",
      generationMode: "format_adaptation",
      ctaVariants: ["CTA 1:1", "CTA 4:5", "CTA 9:16"],
      targetFormats: ["1:1", "4:5", "9:16"],
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: "format_adaptation",
        ctaVariants: ["CTA 1:1", "CTA 4:5", "CTA 9:16"],
        targetFormats: ["1:1", "4:5", "9:16"],
      })
    );
  });

  it("updateCampaign updates generationMode, ctaVariants, targetFormats", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    await updateCampaign("camp-1", workspaceId, {
      generationMode: "art_variation",
      ctaVariants: ["Compre", "Saiba mais"],
      targetFormats: ["1:1"],
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: "art_variation",
        ctaVariants: ["Compre", "Saiba mais"],
        targetFormats: ["1:1"],
      })
    );
  });

  it("createCampaign defaults styleIntensity to medium", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createCampaign(workspaceId, { name: "Restyling" });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ styleIntensity: "medium" })
    );
  });

  it("createCampaign stores styleIntensity", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createCampaign(workspaceId, {
      name: "Restyling",
      generationMode: "restyling",
      styleIntensity: "strong",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ styleIntensity: "strong" })
    );
  });

  it("updateCampaign updates creativeLevel", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    await updateCampaign("camp-1", workspaceId, { creativeLevel: "conservative" });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ creativeLevel: "conservative" })
    );
  });
});
