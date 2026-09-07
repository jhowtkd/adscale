import { describe, expect, it, vi } from "vitest";
import { CATALOG_PAGE_DEFAULT_LIMIT } from "@/lib/catalog-page";
import { listCreativeInspirations } from "./list-creative-inspirations";

const now = new Date("2026-07-16T12:00:00.000Z");

describe("listCreativeInspirations", () => {
  it("returns only the operator-curated collection, even with an active brand", async () => {
    const listCurated = vi.fn(async () => ({
      items: [{ id: "curated-1", name: "Referência.jpg", updatedAt: now }],
      nextCursor: null,
    }));

    const result = await listCreativeInspirations(
      { workspaceId: "workspace-1", clientProfileId: "brand-1" },
      { listCurated },
    );

    expect(listCurated).toHaveBeenCalledWith({
      limit: CATALOG_PAGE_DEFAULT_LIMIT,
      cursor: null,
    });
    expect(result).toEqual({
      items: [
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
      ],
      nextCursor: null,
    });
  });

  it("keeps repository page order and cursor", async () => {
    const result = await listCreativeInspirations(
      { workspaceId: "workspace-1", clientProfileId: null },
      {
        listCurated: async () => ({
          items: [
            { id: "newer", name: "Nova.webp", updatedAt: new Date(now.getTime() + 1_000) },
            { id: "older", name: "Antiga.png", updatedAt: now },
          ],
          nextCursor: "cursor-1",
        }),
      },
    );

    expect(result.items.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result.nextCursor).toBe("cursor-1");
  });
});
