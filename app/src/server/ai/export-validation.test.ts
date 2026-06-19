import { describe, it, expect } from "vitest";
import type { CreativeContract } from "./creative-contract";
import { normalizeExportCtaText, validateExportReadiness } from "./export-validation";

const artVariationContract: CreativeContract = {
  generationMode: "art_variation",
  targetFormat: "4:5",
  ctaSemantics: { kind: "explicit", text: "Shop Now" },
  baseAssetId: "base-1",
  styleAssetId: null,
  client: "Acme Corp",
  product: "Widget",
  offer: "20% off",
  constraints: null,
};

describe("normalizeExportCtaText", () => {
  it.each([
    ["Shop\u00A0Now", "shop now"],
    ["  Shop   Now  ", "shop now"],
    ["Shop Now!", "shop now"],
    ["Shop\u2019Now", "shop'now"],
    ["Shop\u2013Now", "shop-now"],
    ["\u201CShop Now\u201D", '"shop now"'],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeExportCtaText(input)).toBe(expected);
  });
});

describe("validateExportReadiness", () => {
  it("returns ok when there are no export failures", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      observedCtaText: "Shop Now",
      hardFailures: [],
    });
    expect(result.value).toBe("ok");
    expect(result.issues).toHaveLength(0);
    expect(result.setupIssues).toHaveLength(0);
  });

  it("returns bloqueado for wrong_brand", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      hardFailures: [{ code: "wrong_brand", message: "Brand mismatch" }],
    });
    expect(result.value).toBe("bloqueado");
    expect(result.issues.some((issue) => issue.code === "wrong_brand")).toBe(true);
  });

  it("classifies campaign_identity_drift as setup issue", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      hardFailures: [
        { code: "campaign_identity_drift", message: "Campaign setup mismatch" },
      ],
    });
    expect(result.setupIssues.some((issue) => issue.code === "setup_mismatch")).toBe(
      true
    );
    expect(result.issues).toHaveLength(0);
    expect(result.value).toBe("bloqueado");
  });

  it("ignores art-direction failures", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      hardFailures: [
        { code: "generic_template_aesthetic", message: "Template feel" },
        { code: "visual_overload", message: "Overload" },
      ],
    });
    expect(result.value).toBe("ok");
    expect(result.issues).toHaveLength(0);
  });

  it("returns ajuste_menor for punctuation-only CTA drift", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      observedCtaText: "Shop Now!",
      hardFailures: [{ code: "cta_drift", message: "CTA punctuation differs" }],
    });
    expect(result.value).toBe("ajuste_menor");
    expect(result.issues[0]?.severity).toBe("warning");
    expect(result.normalizedCta).toEqual({
      expected: "shop now",
      observed: "shop now",
    });
  });

  it("returns bloqueado for semantic CTA drift", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      observedCtaText: "Buy Today",
      hardFailures: [{ code: "cta_drift", message: "CTA replaced" }],
    });
    expect(result.value).toBe("bloqueado");
    expect(result.issues[0]?.severity).toBe("blocker");
  });

  it("never emits olhar verdict values", () => {
    const result = validateExportReadiness({
      contract: artVariationContract,
      hardFailures: [
        { code: "missing_dominant_idea", message: "No idea" },
        { code: "wrong_brand", message: "Wrong brand" },
      ],
    });
    expect(["ok", "ajuste_menor", "bloqueado"]).toContain(result.value);
  });
});
