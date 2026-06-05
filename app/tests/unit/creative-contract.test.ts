import { describe, it, expect } from "vitest";
import {
  resolveCtaSemantics,
  type CtaSemantics,
  type CreativeContract,
} from "@/server/ai/creative-contract";

describe("resolveCtaSemantics", () => {
  it("returns inherited when ctaText is null for art_variation", () => {
    const result = resolveCtaSemantics(null, "art_variation");
    expect(result).toEqual({ kind: "inherited" } satisfies CtaSemantics);
  });

  it("returns inherited when ctaText is null for format_adaptation", () => {
    const result = resolveCtaSemantics(null, "format_adaptation");
    expect(result).toEqual({ kind: "inherited" } satisfies CtaSemantics);
  });

  it("returns inherited when ctaText is null for restyling", () => {
    const result = resolveCtaSemantics(null, "restyling");
    expect(result).toEqual({ kind: "inherited" } satisfies CtaSemantics);
  });

  it("returns explicit with text when ctaText is a non-empty string", () => {
    const result = resolveCtaSemantics("Comprar agora", "art_variation");
    expect(result).toEqual({
      kind: "explicit",
      text: "Comprar agora",
    } satisfies CtaSemantics);
  });

  it("returns inherited when ctaText is an empty string", () => {
    const result = resolveCtaSemantics("", "art_variation");
    expect(result).toEqual({ kind: "inherited" } satisfies CtaSemantics);
  });

  it("returns inherited when ctaText is undefined for restyling", () => {
    const result = resolveCtaSemantics(undefined, "restyling");
    expect(result).toEqual({ kind: "inherited" } satisfies CtaSemantics);
  });
});

describe("CreativeContract type", () => {
  it("accepts a valid contract object", () => {
    const contract: CreativeContract = {
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaSemantics: { kind: "inherited" },
      baseAssetId: "asset-123",
      styleAssetId: null,
      client: "Acme Corp",
      product: "Widget Pro",
      offer: "20% off",
      constraints: null,
    };
    expect(contract.generationMode).toBe("art_variation");
    expect(contract.ctaSemantics.kind).toBe("inherited");
  });

  it("accepts a restyling contract with styleAssetId", () => {
    const contract: CreativeContract = {
      generationMode: "restyling",
      targetFormat: "9:16",
      ctaSemantics: { kind: "explicit", text: "Buy Now" },
      baseAssetId: "base-001",
      styleAssetId: "style-002",
      client: null,
      product: null,
      offer: null,
      constraints: null,
    };
    expect(contract.styleAssetId).toBe("style-002");
    expect(contract.ctaSemantics).toEqual({ kind: "explicit", text: "Buy Now" });
  });
});
