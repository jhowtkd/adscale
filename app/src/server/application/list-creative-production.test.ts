import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionRow } from "@/server/repositories/creative-production";

const readMock = vi.hoisted(() => vi.fn());
const signedMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-production", () => ({
  readCreativeProductionPage: (...args: unknown[]) => readMock(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: (...args: unknown[]) => signedMock(...args),
  },
}));

import { listCreativeProduction, productionItem } from "./list-creative-production";

const row: ProductionRow = {
  id: "slide:s1",
  kind: "slide",
  sourceId: "s1",
  workId: "w1",
  campaignId: "c1",
  title: "Deck",
  format: "4:5",
  outputKey: "private/output.png",
  createdAt: new Date("2026-09-08T12:00:00Z"),
  sortAt: "2026-09-08T12:00:00.000000Z",
  position: 2,
};

describe("listCreativeProduction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readMock.mockResolvedValue({ rows: [], nextCursor: null });
    signedMock.mockResolvedValue("e2e-storage://download/private/output.png");
  });

  it("projeta slide atual sem chave privada", async () => {
    const item = await productionItem(row);
    expect(item.previewUrl).toBe("/api/creative-work/w1/carousel/slides/s1/download");
    expect(item.reviewHref).toBe("/campaigns/c1?creativeWork=w1");
    expect(item).toMatchObject({ deckId: "w1", position: 2 });
    expect(item).not.toHaveProperty("outputKey");
    expect(item).not.toHaveProperty("sortAt");
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("projeta output sem campanha para a revisão da peça", async () => {
    const item = await productionItem({
      ...row,
      id: "output:o1",
      kind: "output",
      sourceId: "o1",
      campaignId: null,
      position: null,
    });
    expect(item.previewUrl).toBe("/api/creative-work/w1/outputs/o1/download");
    expect(item.reviewHref).toBe("/creative-work/w1");
    expect(item.deckId).toBeNull();
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("projeta createdAt bruto em string sem chamar toISOString no valor cru", async () => {
    const item = await productionItem({
      ...row,
      createdAt: "2026-09-08 12:00:00.123456+00",
      sortAt: "2026-09-08T12:00:00.123456Z",
    });
    expect(item.createdAt).toBe("2026-09-08T12:00:00.123Z");
    expect(item).not.toHaveProperty("sortAt");
  });

  it("assina derivation só depois da leitura autorizada", async () => {
    readMock.mockResolvedValue({
      rows: [{
        ...row,
        id: "derivation:d1",
        kind: "derivation",
        sourceId: "d1",
        workId: null,
        position: null,
      }],
      nextCursor: null,
    });

    const page = await listCreativeProduction({
      workspaceId: "workspace-1",
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      campaignId: "c1",
      limit: 24,
      cursor: null,
    });

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(signedMock).toHaveBeenCalledTimes(1);
    expect(signedMock).toHaveBeenCalledWith("private/output.png");
    expect(page.production).toEqual([expect.objectContaining({
      id: "derivation:d1",
      previewUrl: "e2e-storage://download/private/output.png",
      reviewHref: "/campaigns/c1",
      deckId: null,
    })]);
    expect(page.production[0]).not.toHaveProperty("outputKey");
  });
});
