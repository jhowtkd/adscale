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
  it("creates template from campaign", async () => {
    const mockCampaignLimit = vi.fn().mockResolvedValue([{
      id: "campaign-1",
      client: "Test Client",
      product: null,
      objective: null,
      audience: null,
      platforms: [],
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      generationMode: "art_variation",
      creativeLevel: null,
      styleIntensity: null,
      ctaVariants: null,
      targetFormats: null,
    }]);
    const mockCampaignWhere = vi.fn().mockReturnValue({ limit: mockCampaignLimit });
    const mockCampaignFrom = vi.fn().mockReturnValue({ where: mockCampaignWhere });

    const mockReturning = vi.fn().mockResolvedValue([{
      id: "template-1",
      name: "My Template",
      description: "Test template",
      client: "Test Client",
      workspaceId: TEST_WORKSPACE_ID,
    }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });

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
  });

  it("lists templates for workspace", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([
      { id: "template-1", workspaceId: TEST_WORKSPACE_ID },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const templates = await getTemplates(TEST_WORKSPACE_ID);
    expect(templates.length).toBeGreaterThanOrEqual(1);
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
