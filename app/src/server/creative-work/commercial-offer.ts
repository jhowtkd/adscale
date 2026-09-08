import type { CreativeFact, CreativeWorkFactPack } from "./contracts";

export const COMMERCIAL_OFFER_VERSION = 1 as const;

export type CommercialOfferDocument = {
  version: typeof COMMERCIAL_OFFER_VERSION;
  product: string;
  offer: string;
  price: string | null;
  validFrom: string;
  validUntil: string;
  originWorkId: string;
  slug: string;
};

export type CommercialOfferSnapshot = {
  offerId: string;
  version: number;
  product: string;
  offer: string;
  price: string | null;
  validFrom: string;
  validUntil: string;
};

export type ExtractCommercialOfferError =
  | "missing_product"
  | "missing_offer"
  | "missing_validity"
  | "invalid_window"
  | "brand_required";

export type OfferActiveError = "expired" | "not_yet_valid";

const PT_BR = "pt-BR";

export function normalizeOfferSlug(product: string, offer: string): string {
  return `${normalizeKey(product)}|${normalizeKey(offer)}`;
}

export function assertOfferBrand(input: {
  offerBrandId: string;
  requestedBrandId: string;
}): { ok: true } | { ok: false; error: "brand_mismatch" } {
  if (input.offerBrandId !== input.requestedBrandId) {
    return { ok: false, error: "brand_mismatch" };
  }
  return { ok: true };
}

export function assertOfferActive(
  offer: Pick<CommercialOfferDocument, "validFrom" | "validUntil">,
  now: Date,
): { ok: true } | { ok: false; error: OfferActiveError } {
  const from = Date.parse(offer.validFrom);
  const until = Date.parse(offer.validUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until)) {
    return { ok: false, error: "expired" };
  }
  const t = now.getTime();
  if (t < from) return { ok: false, error: "not_yet_valid" };
  if (t >= until) return { ok: false, error: "expired" };
  return { ok: true };
}

export function extractCommercialOfferFromFactPack(input: {
  factPack: CreativeWorkFactPack;
  originWorkId: string;
  validFrom: string;
  validUntil: string;
  clientProfileId: string | null | undefined;
}): { ok: true; document: CommercialOfferDocument } | { ok: false; error: ExtractCommercialOfferError } {
  if (!input.clientProfileId) return { ok: false, error: "brand_required" };
  const product = firstFact(input.factPack, "product");
  const offer = firstFact(input.factPack, "offer");
  if (!product) return { ok: false, error: "missing_product" };
  if (!offer) return { ok: false, error: "missing_offer" };

  const from = Date.parse(input.validFrom);
  const until = Date.parse(input.validUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until)) {
    return { ok: false, error: "missing_validity" };
  }
  if (until <= from) return { ok: false, error: "invalid_window" };

  return {
    ok: true,
    document: {
      version: COMMERCIAL_OFFER_VERSION,
      product,
      offer,
      price: firstFact(input.factPack, "price"),
      validFrom: new Date(from).toISOString(),
      validUntil: new Date(until).toISOString(),
      originWorkId: input.originWorkId,
      slug: normalizeOfferSlug(product, offer),
    },
  };
}

export function projectOfferFacts(
  offer: Pick<CommercialOfferDocument, "product" | "offer" | "price">,
): CreativeFact[] {
  const facts: CreativeFact[] = [
    { value: offer.product, class: "product", required: true, origin: "catalog" },
    { value: offer.offer, class: "offer", required: true, origin: "catalog" },
  ];
  if (offer.price) {
    facts.push({ value: offer.price, class: "price", required: true, origin: "catalog" });
  }
  return facts;
}

export function mergeCatalogFacts(
  pack: CreativeWorkFactPack,
  offer: Pick<CommercialOfferDocument, "product" | "offer" | "price"> | null | undefined,
): CreativeWorkFactPack {
  if (!offer) return pack;
  const seen = new Set(pack.facts.map((fact) => `${fact.class}:${normalizeKey(fact.value)}`));
  const extra = projectOfferFacts(offer).filter((fact) => {
    const key = `${fact.class}:${normalizeKey(fact.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (extra.length === 0) return pack;
  return { ...pack, facts: [...pack.facts, ...extra] };
}

export function freezeCommercialOfferSnapshot(input: {
  offerId: string;
  version: number;
  document: CommercialOfferDocument;
}): CommercialOfferSnapshot {
  return {
    offerId: input.offerId,
    version: input.version,
    product: input.document.product,
    offer: input.document.offer,
    price: input.document.price,
    validFrom: input.document.validFrom,
    validUntil: input.document.validUntil,
  };
}

export function authorizedOfferRequest(document: CommercialOfferDocument): string {
  return [document.product, document.offer, document.price].filter(Boolean).join(" — ");
}

function firstFact(pack: CreativeWorkFactPack, factClass: CreativeFact["class"]): string | null {
  const match = pack.facts.find((fact) => fact.class === factClass && fact.value.trim().length > 0);
  return match?.value.trim() ?? null;
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase(PT_BR).replace(/\s+/g, " ").trim();
}
