import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "../db";
import {
  createTemplate,
  getTemplates,
  getTemplateById,
  deleteTemplate,
} from "./template";

const TEST_WORKSPACE_ID = "test-workspace-1";

describe("template repository", () => {
  it("creates template from campaign copying full briefing snapshot", async () => {
    const mockCampaignLimit = vi.fn().mockResolvedValue([{
      id: "campaign-1",
      client: "Test Client",
      product: "Course X",
      objective: "Leads",
      audience: "Founders",
      platforms: ["meta_feed", "tiktok"],
      tone: "direct",
      offer: "20% off",
      constraints: "No fake claims",
      notes: "Q3 push",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      ctaVariants: ["Buy now"],
      targetFormats: ["1:1"],
      clientProfileId: "brand-should-not-copy",
      selectedReferenceIds: ["ref-should-not-copy"],
    }]);
    const mockCampaignWhere = vi.fn().mockReturnValue({ limit: mockCampaignLimit });
    const mockCampaignFrom = vi.fn().mockReturnValue({ where: mockCampaignWhere });

    let inserted: Record<string, unknown> | null = null;
    const mockValues = vi.fn().mockImplementation((values) => {
      inserted = values;
      return {
        returning: vi.fn().mockResolvedValue([{
          id: "template-1",
          workspaceId: TEST_WORKSPACE_ID,
          name: "My Template",
          description: "Test template",
          ...values,
        }]),
      };
    });

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ from: mockCampaignFrom });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const template = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId: "campaign-1",
      name: "My Template",
      description: "Test template",
    });

    expect(template.name).toBe("My Template");
    expect(template.description).toBe("Test template");
    expect(template.client).toBe("Test Client");
    expect(template.workspaceId).toBe(TEST_WORKSPACE_ID);
    expect(inserted).toMatchObject({
      product: "Course X",
      objective: "Leads",
      audience: "Founders",
      platforms: ["meta_feed", "tiktok"],
      tone: "direct",
      offer: "20% off",
      constraints: "No fake claims",
      notes: "Q3 push",
      ctaVariants: ["Buy now"],
      targetFormats: ["1:1"],
    });
    expect(inserted).not.toHaveProperty("clientProfileId");
    expect(inserted).not.toHaveProperty("selectedReferenceIds");
  });

  it("lists templates for workspace", async () => {
    const mockLimit = vi.fn().mockResolvedValue([
      { id: "template-1", workspaceId: TEST_WORKSPACE_ID },
    ]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const templates = await getTemplates(TEST_WORKSPACE_ID);
    expect(templates.items.length).toBeGreaterThanOrEqual(1);
    expect(templates.nextCursor).toBeNull();
    expect(mockLimit).toHaveBeenCalledWith(25);
  });

  it("caps the first page at 24 when the workspace has more templates", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      workspaceId: TEST_WORKSPACE_ID,
      updatedAt: new Date(`2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`),
    }));
    const mockLimit = vi.fn().mockResolvedValue(rows);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const templates = await getTemplates(TEST_WORKSPACE_ID);
    expect(templates.items).toHaveLength(24);
    expect(templates.nextCursor).toBeTruthy();
    expect(mockLimit).toHaveBeenCalledWith(25);
  });

  it("gets template by id", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "template-1", name: "Get Me" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const found = await getTemplateById("template-1", TEST_WORKSPACE_ID);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Get Me");
  });

  it("returns null for missing template", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const found = await getTemplateById("non-existent", TEST_WORKSPACE_ID);
    expect(found).toBeNull();
  });

  it("deletes template", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "template-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

    const deleted = await deleteTemplate("template-1", TEST_WORKSPACE_ID);
    expect(deleted).toEqual({ id: "template-1" });
  });

  it("throws for non-existent campaign", async () => {
    const mockCampaignLimit = vi.fn().mockResolvedValue([]);
    const mockCampaignWhere = vi.fn().mockReturnValue({ limit: mockCampaignLimit });
    const mockCampaignFrom = vi.fn().mockReturnValue({ where: mockCampaignWhere });

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockCampaignFrom });

    await expect(
      createTemplate({
        workspaceId: TEST_WORKSPACE_ID,
        campaignId: "non-existent",
        name: "Fail",
      })
    ).rejects.toThrow("Campaign not found");
  });
});
