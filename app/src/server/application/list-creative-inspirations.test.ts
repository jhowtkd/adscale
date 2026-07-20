import { describe, expect, it, vi } from "vitest";
import { listCreativeInspirations } from "./list-creative-inspirations";

const now = new Date("2026-07-16T12:00:00.000Z");

describe("listCreativeInspirations", () => {
  it("returns recent workspace templates and selected completed outputs for the active brand only", async () => {
    const inspirations = await listCreativeInspirations(
      { workspaceId: "workspace-1", clientProfileId: "brand-1" },
      {
        listTemplates: async () => [
          { id: "template-new", workspaceId: "workspace-1", name: "Lançamento", generationMode: "format_adaptation", updatedAt: new Date(now.getTime() + 2_000) },
          { id: "template-old", workspaceId: "workspace-1", name: "Oferta", generationMode: "art_variation", updatedAt: now },
          { id: "template-outside", workspaceId: "workspace-2", name: "Outro workspace", generationMode: "restyling", updatedAt: new Date(now.getTime() + 9_000) },
        ],
        listApprovedWork: async () => [
          { id: "output-approved", workspaceId: "workspace-1", clientProfileId: "brand-1", title: "Matrículas", assetId: "asset-approved", status: "completed", isSelected: true, updatedAt: new Date(now.getTime() + 1_000) },
          { id: "output-other-brand", workspaceId: "workspace-1", clientProfileId: "brand-2", title: "Outra marca", assetId: "asset-other", status: "completed", isSelected: true, updatedAt: new Date(now.getTime() + 8_000) },
          { id: "output-unapproved", workspaceId: "workspace-1", clientProfileId: "brand-1", title: "Não aprovado", assetId: "asset-unapproved", status: "completed", isSelected: false, updatedAt: new Date(now.getTime() + 7_000) },
          { id: "output-processing", workspaceId: "workspace-1", clientProfileId: "brand-1", title: "Processando", assetId: "asset-processing", status: "processing", isSelected: true, updatedAt: new Date(now.getTime() + 6_000) },
          { id: "output-outside", workspaceId: "workspace-2", clientProfileId: "brand-1", title: "Outro workspace", assetId: "asset-outside", status: "completed", isSelected: true, updatedAt: new Date(now.getTime() + 5_000) },
        ],
        listCurated: async () => [
          { id: "curated-1", name: "Editorial.jpg", updatedAt: new Date(now.getTime() + 3_000) },
        ],
      },
    );

    expect(inspirations).toEqual([
      {
        id: "curated-1", source: "curated", title: "Editorial",
        previewUrl: "/api/creative-work/inspirations/curated-1/file", templateId: null,
        assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "restyle",
      },
      {
        id: "template-new", source: "template", title: "Lançamento", previewUrl: null,
        templateId: "template-new", assetId: null, suggestedIntent: "format_adaptation",
      },
      {
        id: "output-approved", source: "approved_work", title: "Matrículas",
        previewUrl: "/api/workspace/assets/asset-approved/file", templateId: null,
        assetId: "asset-approved", suggestedIntent: "restyle",
      },
      {
        id: "template-old", source: "template", title: "Oferta", previewUrl: null,
        templateId: "template-old", assetId: null, suggestedIntent: "variations",
      },
    ]);
  });

  it("maps a restyling template without scoring or model output", async () => {
    const [inspiration] = await listCreativeInspirations(
      { workspaceId: "workspace-1", clientProfileId: "brand-1" },
      {
        listTemplates: async () => [
          { id: "template-1", workspaceId: "workspace-1", name: "Trocar estilo", generationMode: "restyling", updatedAt: now },
        ],
        listApprovedWork: async () => [],
        listCurated: async () => [],
      },
    );

    expect(inspiration.suggestedIntent).toBe("restyle");
    expect(inspiration).not.toHaveProperty("score");
  });

  it("returns curated global inspirations without a client profile", async () => {
    const listApprovedWork = vi.fn();
    const listTemplates = vi.fn();

    const result = await listCreativeInspirations(
      {
        workspaceId: "workspace-1",
        clientProfileId: null,
      },
      {
        listTemplates,
        listApprovedWork,
        listCurated: async () => [{
          id: "curated-1",
          name: "Editorial.jpg",
          updatedAt: new Date("2026-07-20T12:00:00.000Z"),
        }],
      },
    );

    expect(listTemplates).not.toHaveBeenCalled();
    expect(listApprovedWork).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: "curated-1",
        source: "curated",
        previewUrl: "/api/creative-work/inspirations/curated-1/file",
      }),
    ]);
  });
});
