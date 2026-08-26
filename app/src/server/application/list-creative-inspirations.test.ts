import { describe, expect, it, vi } from "vitest";
import { listCreativeInspirations } from "./list-creative-inspirations";

const now = new Date("2026-07-16T12:00:00.000Z");

describe("listCreativeInspirations", () => {
  it("returns only the operator-curated collection, even with an active brand", async () => {
    const listCurated = vi.fn(async () => [
      { id: "curated-1", name: "Referência.jpg", updatedAt: now },
    ]);

    const result = await listCreativeInspirations(
      { workspaceId: "workspace-1", clientProfileId: "brand-1" },
      { listCurated },
    );

    expect(listCurated).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        id: "curated-1",
        source: "curated",
        title: "Referência",
        previewUrl: "/api/creative-work/inspirations/curated-1/file",
        templateId: null,
        assetId: null,
        curatedInspirationId: "curated-1",
        suggestedIntent: "restyle",
      },
    ]);
  });

  it("orders curated references by newest upload", async () => {
    const result = await listCreativeInspirations(
      { workspaceId: "workspace-1", clientProfileId: null },
      {
        listCurated: async () => [
          { id: "older", name: "Antiga.png", updatedAt: now },
          { id: "newer", name: "Nova.webp", updatedAt: new Date(now.getTime() + 1_000) },
        ],
      },
    );

    expect(result.map((item) => item.id)).toEqual(["newer", "older"]);
  });
});
