import { describe, expect, it } from "vitest";
import type { CreativeWorkFactPack } from "./contracts";
import {
  assertOfferActive,
  assertOfferBrand,
  authorizedOfferRequest,
  extractCommercialOfferFromFactPack,
  freezeCommercialOfferSnapshot,
  mergeCatalogFacts,
  normalizeOfferSlug,
  projectOfferFacts,
} from "./commercial-offer";

const pack: CreativeWorkFactPack = {
  version: 1,
  request: "Pós em Psicologia — turma de setembro R$ 497",
  facts: [
    { value: "Pós em Psicologia", class: "product", required: true, origin: "request" },
    { value: "turma de setembro", class: "offer", required: true, origin: "request" },
    { value: "R$ 497", class: "price", required: true, origin: "request" },
  ],
  brand: { requiredElements: [], prohibitedElements: [] },
  identity: { clientProfileId: "brand-a", brandName: "Cenbrap" },
};

describe("commercial offer catalog", () => {
  it("extracts authorized product, offer, price and validity from a fact pack", () => {
    const extracted = extractCommercialOfferFromFactPack({
      factPack: pack,
      originWorkId: "work-1",
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      clientProfileId: "brand-a",
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.document.product).toBe("Pós em Psicologia");
    expect(extracted.document.offer).toBe("turma de setembro");
    expect(extracted.document.price).toBe("R$ 497");
    expect(extracted.document.slug).toBe(normalizeOfferSlug("Pós em Psicologia", "turma de setembro"));
  });

  it("refuses to save without product, offer, brand or a valid window", () => {
    expect(extractCommercialOfferFromFactPack({
      factPack: { ...pack, facts: pack.facts.filter((fact) => fact.class !== "product") },
      originWorkId: "work-1",
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      clientProfileId: "brand-a",
    }).error).toBe("missing_product");

    expect(extractCommercialOfferFromFactPack({
      factPack: pack,
      originWorkId: "work-1",
      validFrom: "2026-10-01T00:00:00.000Z",
      validUntil: "2026-09-01T00:00:00.000Z",
      clientProfileId: "brand-a",
    }).error).toBe("invalid_window");

    expect(extractCommercialOfferFromFactPack({
      factPack: pack,
      originWorkId: "work-1",
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      clientProfileId: null,
    }).error).toBe("brand_required");
  });

  it("blocks an expired or not-yet-valid offer from new generation", () => {
    const window = {
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
    };
    expect(assertOfferActive(window, new Date("2026-09-15T12:00:00.000Z")).ok).toBe(true);
    expect(assertOfferActive(window, new Date("2026-10-01T00:00:00.000Z")).error).toBe("expired");
    expect(assertOfferActive(window, new Date("2026-08-31T23:59:59.000Z")).error).toBe("not_yet_valid");
  });

  it("keeps catalog facts brand-scoped and merges without duplicating the request", () => {
    expect(assertOfferBrand({ offerBrandId: "brand-a", requestedBrandId: "brand-b" }).error).toBe("brand_mismatch");
    const facts = projectOfferFacts({
      product: "Pós em Psicologia",
      offer: "turma de setembro",
      price: "R$ 497",
    });
    expect(facts.every((fact) => fact.origin === "catalog" && fact.required)).toBe(true);

    const merged = mergeCatalogFacts(pack, {
      product: "Pós em Psicologia",
      offer: "turma de setembro",
      price: "R$ 497",
    });
    expect(merged.facts.filter((fact) => fact.origin === "catalog")).toHaveLength(0);

    const snapshot = freezeCommercialOfferSnapshot({
      offerId: "offer-1",
      version: 2,
      document: {
        version: 1,
        product: "Pós em Psicologia",
        offer: "turma de setembro",
        price: "R$ 497",
        validFrom: "2026-09-01T00:00:00.000Z",
        validUntil: "2026-10-01T00:00:00.000Z",
        originWorkId: "work-1",
        slug: "pos|turma",
      },
    });
    expect(snapshot.version).toBe(2);
    expect(authorizedOfferRequest({
      version: 1,
      product: "Pós em Psicologia",
      offer: "turma de setembro",
      price: "R$ 497",
      validFrom: snapshot.validFrom,
      validUntil: snapshot.validUntil,
      originWorkId: "work-1",
      slug: "pos|turma",
    })).toContain("R$ 497");
  });
});
