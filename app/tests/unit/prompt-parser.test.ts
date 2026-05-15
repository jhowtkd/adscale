import { describe, it, expect } from "vitest";
import {
  buildPlanPrompt,
  buildDerivationPrompt,
} from "@/server/ai/prompt-builder";
import type { Campaign, Asset, Plan } from "@/server/ai/prompt-builder";

describe("buildPlanPrompt", () => {
  it("returns a string containing campaign name", () => {
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

  it("includes reference asset when provided", () => {
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
  it("includes feedback when provided", () => {
    const plan: Plan = {
      id: "p1",
      strategy: "Bold",
      angles: ["Angle 1"],
      hooks: ["Hook 1"],
      ctas: ["CTA 1"],
    };

    const prompt = buildDerivationPrompt({ plan, feedback: "Make it brighter" });
    expect(prompt).toContain("Revision Feedback: Make it brighter");
  });

  it("does not include feedback when empty", () => {
    const plan: Plan = {
      id: "p1",
      strategy: "Bold",
      angles: null,
      hooks: null,
      ctas: null,
    };

    const prompt = buildDerivationPrompt({ plan, feedback: "" });
    expect(prompt).not.toContain("Revision Feedback");
  });

  it("includes plan strategy when plan exists", () => {
    const plan: Plan = {
      id: "p1",
      strategy: "Minimalist",
      angles: null,
      hooks: null,
      ctas: null,
    };

    const prompt = buildDerivationPrompt({ plan });
    expect(prompt).toContain("Creative Strategy: Minimalist");
  });

  it("art_variation mode demands perceptible variation", () => {
    const prompt = buildDerivationPrompt({ generationMode: "art_variation" });
    expect(prompt).toContain("MODE: art_variation");
    expect(prompt).toContain("PERCEPTIBLY DIFFERENT");
    expect(prompt).toContain("Vary background, composition, CTA module placement, and visual hierarchy");
  });

  it("format_adaptation mode includes target format", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });
    expect(prompt).toContain("MODE: format_adaptation");
    expect(prompt).toContain("Target format: 9:16");
    expect(prompt).toContain("PRESERVE EXACTLY");
    expect(prompt).toContain("DO NOT");
    expect(prompt).toContain("For 9:16 (vertical story)");
  });

  it("includes logo preservation rule", () => {
    const prompt = buildDerivationPrompt({});
    expect(prompt).toContain("CRITICAL LOGO RULE");
    expect(prompt).toContain("Do NOT invent a logo");
  });

  it("includes applied CTA when provided", () => {
    const prompt = buildDerivationPrompt({ ctaText: "Compre agora" });
    expect(prompt).toContain("Applied CTA text for this piece: Compre agora");
  });

  it("includes variant index for art_variation", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      variantIndex: 2,
    });
    expect(prompt).toContain("Variant index: 3");
  });
});
