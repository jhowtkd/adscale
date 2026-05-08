import { describe, it, expect } from "vitest";
import {
  createTemplate,
  getTemplates,
  getTemplateById,
  deleteTemplate,
} from "./template";
import { createCampaign } from "./campaign";

const TEST_WORKSPACE_ID = "test-workspace-1";

describe("template repository", () => {
  it("creates template from campaign", async () => {
    const campaign = await createCampaign(TEST_WORKSPACE_ID, {
      name: "Test Campaign",
      client: "Test Client",
      generationMode: "art_variation",
    });

    const template = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId: campaign.id,
      name: "My Template",
      description: "Test template",
    });

    expect(template.name).toBe("My Template");
    expect(template.description).toBe("Test template");
    expect(template.client).toBe("Test Client");
    expect(template.workspaceId).toBe(TEST_WORKSPACE_ID);
  });

  it("lists templates for workspace", async () => {
    const campaign = await createCampaign(TEST_WORKSPACE_ID, {
      name: "List Test Campaign",
      generationMode: "art_variation",
    });

    await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId: campaign.id,
      name: "Template 1",
    });

    const templates = await getTemplates(TEST_WORKSPACE_ID);
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  it("gets template by id", async () => {
    const campaign = await createCampaign(TEST_WORKSPACE_ID, {
      name: "Get Test Campaign",
      generationMode: "art_variation",
    });

    const created = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId: campaign.id,
      name: "Get Me",
    });

    const found = await getTemplateById(created.id, TEST_WORKSPACE_ID);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Get Me");
  });

  it("returns null for missing template", async () => {
    const found = await getTemplateById("non-existent", TEST_WORKSPACE_ID);
    expect(found).toBeNull();
  });

  it("deletes template", async () => {
    const campaign = await createCampaign(TEST_WORKSPACE_ID, {
      name: "Delete Test Campaign",
      generationMode: "art_variation",
    });

    const created = await createTemplate({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId: campaign.id,
      name: "Delete Me",
    });

    await deleteTemplate(created.id, TEST_WORKSPACE_ID);
    const found = await getTemplateById(created.id, TEST_WORKSPACE_ID);
    expect(found).toBeNull();
  });

  it("throws for non-existent campaign", async () => {
    await expect(
      createTemplate({
        workspaceId: TEST_WORKSPACE_ID,
        campaignId: "non-existent",
        name: "Fail",
      })
    ).rejects.toThrow("Campaign not found");
  });
});
