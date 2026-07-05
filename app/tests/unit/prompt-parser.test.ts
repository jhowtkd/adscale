import { describe, it, expect } from "vitest";
import {
  buildPlanPrompt,
  buildDerivationPrompt,
} from "@/server/ai/prompt-builder";
import type { Campaign, Asset, Plan } from "@/server/ai/prompt-builder";

describe("buildPlanPrompt", () => {
  it("returns a string containing campaign name", async () => {
    const campaign: Campaign = {
      id: "c1",
      workspaceId: "ws1",
      name: "Summer Sale",
      client: "Acme",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prompt = buildPlanPrompt(campaign);
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("Summer Sale");
  });

  it("includes reference asset when provided", async () => {
    const campaign: Campaign = {
      id: "c1",
      workspaceId: "ws1",
      name: "Summer Sale",
      client: null,
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const asset: Asset = {
      id: "a1",
      campaignId: "c1",
      workspaceId: "ws1",
      key: "assets/hero.png",
      type: "image/png",
      size: null,
      width: null,
      height: null,
      createdAt: new Date(),
    };

    const prompt = buildPlanPrompt(campaign, asset);
    expect(prompt).toContain("Reference Asset");
    expect(prompt).toContain("assets/hero.png");
  });
});

describe("buildDerivationPrompt", () => {
  it("includes feedback when provided", async () => {
    const plan: Plan = {
      id: "p1",
      strategy: "Bold",
      angles: ["Angle 1"],
      hooks: ["Hook 1"],
      ctas: ["CTA 1"],
    };

    const prompt = await buildDerivationPrompt({ plan, feedback: "Make it brighter" });
    expect(prompt).toContain("Revision Feedback: Make it brighter");
  });

  it("does not include feedback when empty", async () => {
    const plan: Plan = {
      id: "p1",
      strategy: "Bold",
      angles: null,
      hooks: null,
      ctas: null,
    };

    const prompt = await buildDerivationPrompt({ plan, feedback: "" });
    expect(prompt).not.toContain("Revision Feedback");
  });

  it("includes plan strategy when plan exists", async () => {
    const plan: Plan = {
      id: "p1",
      strategy: "Minimalist",
      angles: null,
      hooks: null,
      ctas: null,
    };

    const prompt = await buildDerivationPrompt({ plan });
    expect(prompt).toContain("Creative Strategy: Minimalist");
  });

  it("art_variation mode demands composition mechanism, not decorative-only swaps", async () => {
    const prompt = await buildDerivationPrompt({ generationMode: "art_variation" });
    expect(prompt).toContain("MODE: art_variation");
    expect(prompt).toMatch(/DECORATIVE-ONLY|decorative-only/i);
    expect(prompt).toMatch(/composition mechanism|focal hierarchy/i);
    expect(prompt).toContain("ANTI-CROPPING RULE");
    expect(prompt).toContain("REARRANGEMENT RULE");
    expect(prompt).toContain("LAYOUT SAFETY PASS");
    expect(prompt).toContain("SAFE MARGIN GUIDANCE");
  });

  it("format_adaptation mode includes target format", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });
    expect(prompt).toContain("MODE: format_adaptation");
    expect(prompt).toContain("Target format: 9:16");
    expect(prompt).toContain("PRESERVE FACTS, FLEX EXPRESSION");
    expect(prompt).toContain("DO NOT");
    expect(prompt).toContain("For 9:16 (vertical story)");
  });

  it("includes logo preservation rule", async () => {
    const prompt = await buildDerivationPrompt({});
    expect(prompt).toContain("HARD RULES / NON-NEGOTIABLE CONTRACT");
    expect(prompt).toContain("CRITICAL LOGO RULE");
    expect(prompt).toContain("Do NOT invent a logo");
  });

  it("includes CTA action reference when provided", async () => {
    const prompt = await buildDerivationPrompt({ ctaText: "Compre agora" });
    expect(prompt).toContain("Compre agora");
    expect(prompt).toContain("CTA PRESENCE: optional");
  });

  it("keeps hard rules before flexible plan guidance", async () => {
    const prompt = await buildDerivationPrompt({
      locale: "pt-BR",
      ctaText: "Compre agora",
      targetFormat: "4:5",
      plan: {
        id: "p1",
        strategy: "Minimalist",
        angles: ["Angle"],
        hooks: ["Hook"],
        ctas: ["CTA alternativa"],
      },
    });

    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("Creative Strategy: Minimalist")
    );
    expect(prompt).toContain("CTA Recommendations:");
    expect(prompt).toContain("Target format: 4:5");
    expect(prompt).toContain("IDIOMA OBRIGATORIO");
    expect(prompt).toContain("Compre agora");
  });

  it("includes variant index for art_variation", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      variantIndex: 2,
    });
    expect(prompt).toContain("Variant index: 3");
  });
});
