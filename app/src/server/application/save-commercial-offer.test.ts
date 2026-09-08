import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCommercialOfferFromWork } from "./save-commercial-offer";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
}));
vi.mock("@/server/repositories/commercial-offer", () => ({
  insertCommercialOffer: vi.fn(),
}));

import { getCreativeWork } from "@/server/repositories/creative-work";
import { insertCommercialOffer } from "@/server/repositories/commercial-offer";

const getWork = vi.mocked(getCreativeWork);
const insertOffer = vi.mocked(insertCommercialOffer);

const factPack = {
  version: 1 as const,
  request: "Pós em Psicologia — turma de setembro R$ 497",
  facts: [
    { value: "Pós em Psicologia", class: "product" as const, required: true, origin: "request" as const },
    { value: "turma de setembro", class: "offer" as const, required: true, origin: "request" as const },
    { value: "R$ 497", class: "price" as const, required: true, origin: "request" as const },
  ],
  brand: { requiredElements: [], prohibitedElements: [] },
  identity: { clientProfileId: "brand-a", brandName: "Cenbrap" },
};

describe("saveCommercialOfferFromWork", () => {
  beforeEach(() => {
    getWork.mockReset();
    insertOffer.mockReset();
  });

  it("persists a brand-scoped offer from authorized fact-pack claims", async () => {
    getWork.mockResolvedValue({
      work: {
        id: "work-1",
        clientProfileId: "brand-a",
        inputSnapshot: { request: factPack.request, settings: { targetFormats: [] }, sources: [], factPack },
      },
      outputs: [],
      sources: [],
    } as never);
    insertOffer.mockResolvedValue({ id: "offer-1", version: 1 } as never);

    const saved = await saveCommercialOfferFromWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
    });
    expect(saved.ok).toBe(true);
    expect(insertOffer).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      document: expect.objectContaining({ product: "Pós em Psicologia", offer: "turma de setembro" }),
    }));
  });

  it("does not invent an offer when the fact pack has no authorized claims", async () => {
    getWork.mockResolvedValue({
      work: {
        id: "work-1",
        clientProfileId: "brand-a",
        inputSnapshot: { request: "fazer uma peça", settings: { targetFormats: [] }, sources: [] },
      },
      outputs: [],
      sources: [],
    } as never);

    const saved = await saveCommercialOfferFromWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      validUntil: "2026-10-01T00:00:00.000Z",
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.error.code).toBe("missing_offer");
    expect(insertOffer).not.toHaveBeenCalled();
  });
});
