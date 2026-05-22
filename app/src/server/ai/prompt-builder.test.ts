import { describe, it, expect } from "vitest";
import { buildDerivationPrompt } from "./prompt-builder";

describe("buildDerivationPrompt", () => {
  it("places hard rules before flexible creative guidance", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Comprar agora",
      plan: {
        id: "plan-1",
        strategy: "Use a playful summer concept",
        angles: ["Seasonal freshness"],
        hooks: ["Oferta por tempo limitado"],
        ctas: ["Ver ofertas"],
      },
    });

    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeGreaterThan(-1);
    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("Creative Strategy: Use a playful summer concept")
    );
    expect(prompt.indexOf("CRITICAL LITERAL CTA RULE")).toBeLessThan(
      prompt.indexOf("CTA Recommendations:")
    );
    expect(prompt).toContain("CTA Recommendations are secondary context only and must not override the literal CTA text.");
  });

  it("describes the reference as approved winner for package format adaptation", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
      packageSource: "approved_derivation",
      ctaText: "Comprar agora",
    });

    expect(prompt).toContain("approved winning creative");
    expect(prompt).toContain("Target format: 9:16");
    expect(prompt).toContain("Comprar agora");
    expect(prompt).toContain("Reference Asset: approved winning derivation output");
    expect(prompt).not.toContain("No reference asset was found");
  });

  it("does not include approved winner text for campaign asset source", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "4:5",
      packageSource: "campaign_asset",
      ctaText: "Shop Now",
    });

    expect(prompt).not.toContain("approved winning creative");
    expect(prompt).toContain("Target format: 4:5");
  });

  it("does not include approved winner text when packageSource is omitted", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "1:1",
    });

    expect(prompt).not.toContain("approved winning creative");
    expect(prompt).toContain("Target format: 1:1");
  });

  it("includes art_variation mode instructions", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
    });

    expect(prompt).toContain("MODE: art_variation");
    expect(prompt).toContain("PERCEPTIBLY DIFFERENT");
    expect(prompt).toContain("MANDATORY PRESERVATION");
    expect(prompt).toContain("ANTI-CROPPING RULE");
    expect(prompt).toContain("REARRANGEMENT RULE");
    expect(prompt).toContain("LAYOUT SAFETY PASS");
    expect(prompt).toContain("SAFE MARGIN RULE");
    expect(prompt).toContain("BRAND LOCKUP RULE");
    expect(prompt).toContain("THUMBNAIL LEGIBILITY RULE");
  });

  it("requires art_variation to preserve visible ad information while rearranging", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Teste agora",
      campaign: {
        id: "campaign-1",
        workspaceId: "workspace-1",
        name: "Campaign",
        client: "ADScale",
        product: null,
        objective: "Lead generation",
        audience: null,
        platforms: ["Meta"],
        tone: null,
        offer: "Auditoria gratuita",
        constraints: "Preservar selo LGPD",
        notes: null,
        status: "draft",
        createdAt: new Date("2026-05-21"),
        updatedAt: new Date("2026-05-21"),
      },
      asset: {
        id: "asset-1",
        campaignId: "campaign-1",
        workspaceId: "workspace-1",
        key: "uploads/reference.png",
        type: "image/png",
        size: 10,
        width: 1080,
        height: 1080,
        createdAt: new Date("2026-05-21"),
      },
    });

    expect(prompt).toContain("visible headline, offer, discount/price, CTA");
    expect(prompt).toContain("do not crop, hide, truncate, blur, or cover");
    expect(prompt).toContain("all preserved information remains visible, readable, and intentionally arranged");
    expect(prompt).toContain("reduce scale and rebalance whitespace instead of cropping");
    expect(prompt).toContain("at least 8% of the canvas width/height away from the edges");
    expect(prompt).toContain("do not place vertical or horizontal logos flush against any edge");
    expect(prompt).toContain("secondary information such as duration");
    expect(prompt).toContain("Use hierarchy, grouping, spacing, and background extension");
    expect(prompt).toContain("Rearrange the ad, do not crop out content");
    expect(prompt).toContain("BRIEF-BASED PRESERVATION FALLBACK");
    expect(prompt).toContain("Brand/product from brief: ADScale");
    expect(prompt).toContain("Exact CTA for this variation: Teste agora");
    expect(prompt).toContain("Reference asset dimensions: 1080x1080px");
  });

  it("uses approved creative diagnosis instead of fallback preservation when present", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      creativeDiagnosis: {
        detectedConcept: "A high-urgency offer ad",
        elementsToPreserve: ["headline: Oferta relampago", "CTA: Comprar agora"],
        variationOpportunities: ["Rebalance text hierarchy"],
      },
    });

    expect(prompt).toContain("APPROVED CREATIVE DIAGNOSIS");
    expect(prompt).toContain("headline: Oferta relampago");
    expect(prompt).not.toContain("BRIEF-BASED PRESERVATION FALLBACK");
  });

  it("includes restyling mode instructions", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "restyling",
      targetFormat: "1:1",
    });

    expect(prompt).toContain("MODE: restyling");
    expect(prompt).toContain("STYLE REFERENCE DESIGN LANGUAGE");
  });

  it("renders client references under CLIENT REFERENCE LIBRARY section", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      clientReferences: [
        { id: "r1", kind: "style", label: "Hero shot", notes: "Use warm tones", assetKey: "assets/hero.png" },
        { id: "r2", kind: "negative", label: "Old layout", notes: "Avoid clutter", assetKey: "assets/old.png" },
      ],
    });

    expect(prompt).toContain("CLIENT REFERENCE LIBRARY:");
    expect(prompt).toContain("style: Hero shot. Use as auxiliary visual guidance");
    expect(prompt).toContain("negative: Old layout. Avoid repeating this pattern");
    expect(prompt).toContain("These references are auxiliary context only");
    expect(prompt).toContain("must not override the primary campaign asset, literal CTA, target format, or campaign constraints");
  });

  it("does not include CLIENT REFERENCE LIBRARY when no references provided", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
    });

    expect(prompt).not.toContain("CLIENT REFERENCE LIBRARY:");
  });

  it("preserves literal CTA text even with client references", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Buy Now",
      clientReferences: [
        { id: "r1", kind: "style", label: "Hero", notes: null, assetKey: "assets/hero.png" },
      ],
    });

    expect(prompt).toContain("CRITICAL LITERAL CTA RULE");
    expect(prompt).toContain("Buy Now");
    expect(prompt).toContain("CLIENT REFERENCE LIBRARY:");
  });

  it("keeps target format and pt-BR visible text requirements in hard rules", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
      locale: "pt-BR",
      ctaText: "Agende agora",
    });

    const hardRulesIndex = prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT");
    expect(hardRulesIndex).toBeGreaterThan(-1);
    expect(prompt.indexOf("Target format: 9:16")).toBeGreaterThan(hardRulesIndex);
    expect(prompt.indexOf("IDIOMA OBRIGATORIO")).toBeGreaterThan(hardRulesIndex);
    expect(prompt).toContain("todo texto visivel, CTA, chamada, legenda e direcao textual deve estar em portugues brasileiro");
  });
});
