import { describe, it, expect } from "vitest";
import { buildDerivationPrompt, type DerivationPromptConfig } from "@/server/ai/prompt-builder";

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
    expect(prompt).toContain("do not introduce new scenes");
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
    expect(prompt).toContain("noticeable new composition");
    expect(prompt).toContain("sibling creative from the same campaign");
    expect(prompt).toContain("keep brand identity recognizable");
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
    expect(prompt).toContain("stronger changes to layout");
    expect(prompt).toContain("preserve core brand assets");
    expect(prompt).toContain("do not invent a new brand");
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
