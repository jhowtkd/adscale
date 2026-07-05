import { describe, it, expect } from "vitest";
import {
  resolveCtaSemantics,
  type CtaSemantics,
  type CreativeContract,
} from "@/server/ai/creative-contract";
import {
  resolveCanonicalCreative,
  buildCanonicalContractPromptSection,
  type CanonicalCreative,
} from "@/server/ai/canonical-creative-contract";
import { campaignFixture, artVariationContractFixture } from "@/server/ai/prompt-builder.test-fixtures";

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

describe("canonical creative contract", () => {
  const campaign = campaignFixture();

  it("resolveCanonicalCreative defaults dominantIdea and hook from campaign fixture", () => {
    const contract = artVariationContractFixture();
    const canonical = resolveCanonicalCreative(contract, campaign);

    expect(canonical.dominantIdea).toBe("Lead generation");
    expect(canonical.hook).toBe("Auditoria gratuita");
    expect(canonical.proofZone).toBe("Widget Pro");
    expect(canonical.invariantIdentity.campaign).toBe("ADScale Launch");
    expect(canonical.invariantIdentity.brand).toBe("Acme Corp");
    expect(canonical.invariantIdentity.product).toBe("Widget Pro");
    expect(canonical.tiers.mandatory).toContain("hook/headline");
    expect(canonical.tiers.condensable).toContain("badges");
    expect(canonical.tiers.decorative).toContain("icon rows");
  });

  it("detectedConcept overrides dominantIdea when diagnosis is present", () => {
    const contract = artVariationContractFixture();
    const canonical = resolveCanonicalCreative(contract, campaign, {
      detectedConcept: "Urgency-led social proof",
    });

    expect(canonical.dominantIdea).toBe("Urgency-led social proof");
    expect(canonical.hook).toBe("Auditoria gratuita");
  });

  it("buildCanonicalContractPromptSection contains CONT-01/02 labels and precedence prose", () => {
    const contract = artVariationContractFixture({
      canonicalCreative: resolveCanonicalCreative(
        artVariationContractFixture(),
        campaign
      ),
    });
    const section = buildCanonicalContractPromptSection(contract).join("\n");

    expect(section).toContain("CANONICAL CREATIVE CONTRACT:");
    expect(section).toContain("Dominant idea:");
    expect(section).toContain("Primary hook");
    expect(section).toContain("Proof/offer zone");
    expect(section).toContain("Invariant identity");
    expect(section).toContain("CONTENT TIERS:");
    expect(section).toContain("RULE PRECEDENCE");
    expect(section).toContain("Factual accuracy");
    expect(section).toContain("Requested fidelity");
    expect(section).toContain("3. Art direction");
    expect(section.indexOf("Factual accuracy")).toBeLessThan(
      section.indexOf("Requested fidelity")
    );
    expect(section.indexOf("Requested fidelity")).toBeLessThan(
      section.indexOf("3. Art direction")
    );
    expect(section).toContain(
      "When mode instructions conflict with this block, this block wins."
    );
    expect(section).toContain("Comprar agora");
  });

  it("resolveCanonicalCreative output matches CanonicalCreative shape for art_variation fixture", () => {
    const contract = artVariationContractFixture();
    const canonical = resolveCanonicalCreative(contract, campaign);

    const shape: CanonicalCreative = canonical;
    expect(shape.dominantIdea).toBeTruthy();
    expect(shape.hook).toBeTruthy();
    expect(shape.proofZone).toBeTruthy();
    expect(shape.invariantIdentity.people).toEqual([]);
    expect(shape.tiers.mandatory.length).toBeGreaterThan(0);
    expect(shape.tiers.condensable.length).toBeGreaterThan(0);
    expect(shape.tiers.decorative.length).toBeGreaterThan(0);
  });
});
