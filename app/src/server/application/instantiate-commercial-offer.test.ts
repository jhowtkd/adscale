import { beforeEach, describe, expect, it, vi } from "vitest";
import { instantiateCommercialOffer } from "./instantiate-commercial-offer";
import type { CommercialOfferDocument } from "@/server/creative-work/commercial-offer";

vi.mock("@/server/repositories/commercial-offer", () => ({
  getCommercialOfferInWorkspace: vi.fn(),
}));
vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWorkDraft: vi.fn(),
}));

import { getCommercialOfferInWorkspace } from "@/server/repositories/commercial-offer";
import { createCreativeWorkDraft } from "@/server/repositories/creative-work";

const getOffer = vi.mocked(getCommercialOfferInWorkspace);
const createDraft = vi.mocked(createCreativeWorkDraft);

const document: CommercialOfferDocument = {
  version: 1,
  product: "Pós em Psicologia",
  offer: "turma de setembro",
  price: "R$ 497",
  validFrom: "2026-09-01T00:00:00.000Z",
  validUntil: "2026-10-01T00:00:00.000Z",
  originWorkId: "work-origin",
  slug: "pos|turma",
};

describe("instantiateCommercialOffer", () => {
  beforeEach(() => {
    getOffer.mockReset();
    createDraft.mockReset();
  });

  it("pins the catalog version on a new work for the same brand", async () => {
    getOffer.mockResolvedValue({
      id: "offer-1",
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      version: 2,
      document,
    } as never);
    createDraft.mockResolvedValue({ id: "work-2" } as never);

    const result = await instantiateCommercialOffer({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-a",
      draftKey: "draft-1",
      offerId: "offer-1",
      now: new Date("2026-09-15T00:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: "brand-a",
      inputSnapshot: expect.objectContaining({
        commercialOffer: expect.objectContaining({ offerId: "offer-1", version: 2 }),
      }),
    }));
  });

  it("rejects another brand and an expired offer before creating a work", async () => {
    getOffer.mockResolvedValue({
      id: "offer-1",
      clientProfileId: "brand-a",
      version: 1,
      document,
    } as never);

    const mismatch = await instantiateCommercialOffer({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-b",
      draftKey: "draft-1",
      offerId: "offer-1",
      now: new Date("2026-09-15T00:00:00.000Z"),
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error.code).toBe("brand_mismatch");

    const expired = await instantiateCommercialOffer({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-a",
      draftKey: "draft-1",
      offerId: "offer-1",
      now: new Date("2026-10-02T00:00:00.000Z"),
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.code).toBe("expired");
    expect(createDraft).not.toHaveBeenCalled();
  });
});
