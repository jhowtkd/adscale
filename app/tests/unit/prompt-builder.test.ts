import { describe, it, expect } from "vitest";
import { buildDerivationPrompt, buildRestylingPrompt, type DerivationPromptConfig, type Campaign } from "@/server/ai/prompt-builder";

describe("buildDerivationPrompt creativity level", () => {
  it("art_variation + conservative contains CREATIVITY LEVEL: conservative", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "conservative",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: conservative");
  });

  it("art_variation + conservative emits restraint-oriented operational rules", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "conservative",
    });

    expect(prompt).toContain("OPERATIONAL RULES FOR CONSERVATIVE");
    expect(prompt).toContain("minimal structural change");
    expect(prompt).toContain("same visual universe");
    expect(prompt).toContain("Do not introduce new scenes");
  });

  it("art_variation + balanced contains CREATIVITY LEVEL: balanced", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "balanced",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });

  it("art_variation + balanced emits sibling-campaign operational rules", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "balanced",
    });

    expect(prompt).toContain("OPERATIONAL RULES FOR BALANCED");
    expect(prompt).toContain("noticeably new composition");
    expect(prompt).toContain("sibling creative from the same campaign");
    expect(prompt).toContain("keeping brand identity recognizable");
  });

  it("art_variation + bold contains CREATIVITY LEVEL: bold", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "bold",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: bold");
  });

  it("art_variation + bold emits high-change-but-on-brand operational rules", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "bold",
    });

    expect(prompt).toContain("OPERATIONAL RULES FOR BOLD");
    expect(prompt).toContain("Change the background structure completely");
    expect(prompt).toContain("Preserve core brand assets");
    expect(prompt).toContain("Do not invent a new brand");
  });

  it("format_adaptation + any creativeLevel does NOT contain CREATIVITY LEVEL", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      creativeLevel: "bold",
    });
    expect(prompt).not.toContain("CREATIVITY LEVEL");
  });

  it("art_variation without creativeLevel defaults to balanced", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });

  it("art_variation includes approved creative diagnosis when provided", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeDiagnosis: {
        detectedConcept: "Premium skincare promotion.",
        elementsToPreserve: ["product", "logo"],
        variationOpportunities: ["stronger contrast"],
      },
    });
    expect(prompt).toContain("APPROVED CREATIVE DIAGNOSIS");
    expect(prompt).toContain("Premium skincare promotion.");
    expect(prompt).toContain("product; logo");
    expect(prompt).toContain("stronger contrast");
  });

  it("format_adaptation does not include creative diagnosis", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      creativeDiagnosis: {
        detectedConcept: "Test",
        elementsToPreserve: ["a"],
        variationOpportunities: ["b"],
      },
    });
    expect(prompt).not.toContain("APPROVED CREATIVE DIAGNOSIS");
  });
});

describe("buildDerivationPrompt CTA contract", () => {
  it("emits a critical literal CTA rule when ctaText exists", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      ctaText: "Comprar agora",
    });

    expect(prompt).toContain("CRITICAL LITERAL CTA RULE");
    expect(prompt).toContain("Comprar agora");
    expect(prompt).toContain("Do not use synonyms");
    expect(prompt).toContain("Do not translate");
    expect(prompt).toContain("Do not rewrite");
    expect(prompt).toContain("Do not replace");
  });

  it("keeps plan CTA recommendations secondary when literal ctaText exists", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      ctaText: "Comprar agora",
      plan: {
        id: "plan-1",
        strategy: "Use urgency.",
        angles: [],
        hooks: [],
        ctas: ["Garanta sua vaga", "Saiba mais"],
      },
    });

    expect(prompt).toContain("Applied CTA text for this piece: Comprar agora");
    expect(prompt).toContain("CTA Recommendations are secondary context only");
    expect(prompt).toContain("must not override the literal CTA text");
  });
});

describe("buildDerivationPrompt restyling mode", () => {
  it("separates base image content from style reference design language", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "restyling",
      visualTokenBrief: "Style reference: premium editorial shadows and serif typography.",
      asset: {
        id: "asset-1",
        campaignId: "campaign-1",
        workspaceId: "workspace-1",
        key: "uploads/base-image.png",
        type: "image/png",
        size: 1024,
        width: 1080,
        height: 1080,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    } as DerivationPromptConfig);

    expect(prompt).toContain("MODE: restyling");
    expect(prompt).toContain("BASE IMAGE CONTENT SOURCE");
    expect(prompt).toContain("preserve the base image subject, product, offer, CTA, and factual content");
    expect(prompt).toContain("STYLE REFERENCE DESIGN LANGUAGE");
    expect(prompt).toContain("borrow only visual language from the style reference");
    expect(prompt).toContain("do not copy factual content from the style reference");
  });
});

describe("buildRestylingPrompt", () => {
  const contentBrief = {
    product: "Agronomy course",
    offer: "50% off enrollment",
    cta: { text: "Sign up now", style: "red button" },
    brandElements: ["UCDB logo"],
    keyVisual: "Student with tablet",
    textContent: { headline: "AGRONOMY", bullets: ["Field experience"] },
    format: "1:1",
  };

  const styleBrief = {
    colorPalette: { dominant: ["black"], accents: ["yellow"], gradients: "none" },
    typography: { personality: "grunge", effects: ["torn edges"] },
    textures: ["grain", "noise"],
    composition: "collage",
    mood: "energetic",
    decorativeElements: ["badges"],
    photoTreatment: "high contrast",
  };

  const campaign = { name: "UCDB Agronomy", client: "UCDB" } as Campaign;

  it("includes content brief and style brief in prompt", () => {
    const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR");

    expect(prompt).toContain("Agronomy course");
    expect(prompt).toContain("50% off enrollment");
    expect(prompt).toContain("grunge");
    expect(prompt).toContain("collage");
    expect(prompt).toContain("INSCREVA-SE");
    expect(prompt).toContain("portugues brasileiro");
  });

  it("includes soft style intensity instruction", () => {
    const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR", "soft");
    expect(prompt).toContain("STYLE INTENSITY: soft");
    expect(prompt).toContain("Borrow mainly palette, subtle texture, and mood");
  });

  it("includes medium style intensity instruction by default", () => {
    const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR");
    expect(prompt).toContain("STYLE INTENSITY: medium");
    expect(prompt).toContain("Balance base content with reference style");
  });

  it("includes strong style intensity instruction", () => {
    const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR", "strong");
    expect(prompt).toContain("STYLE INTENSITY: strong");
    expect(prompt).toContain("high presence");
  });

  it("normalizes invalid style intensity to medium", () => {
    const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, "INSCREVA-SE", "pt-BR", "extreme" as never);
    expect(prompt).toContain("STYLE INTENSITY: medium");
  });
});
