import { describe, expect, it } from "vitest";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "../brand-training/contracts";
import type {
  CreativeLevel,
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
  SocialPostCopy,
} from "./contracts";

import { buildSocialPostPrompt } from "./prompt";

function analysis(overrides: Partial<BrandTrainingAnalysis> = {}): BrandTrainingAnalysis {
  return {
    description: "An asset",
    visualAttributes: ["modern"],
    rules: [],
    constraints: [],
    confidence: 0.9,
    ...overrides,
  };
}

function asset(
  overrides: {
    referenceId?: string;
    assetKey?: string;
    label?: string;
    category?: BrandTrainingCategory;
    usageMode?: BrandTrainingUsageMode;
    placement?: CreativeWorkIdentityAssetSnapshot["placement"];
    analysis?: BrandTrainingAnalysis | null;
  } = {},
): CreativeWorkIdentityAssetSnapshot {
  return {
    referenceId: overrides.referenceId ?? "ref-1",
    assetKey: overrides.assetKey ?? "workspaces/ws-1/assets/ref-1.png",
    label: overrides.label ?? "Asset 1",
    category: overrides.category ?? "logo",
    usageMode: overrides.usageMode ?? "exact",
    analysis: overrides.analysis === undefined ? analysis() : overrides.analysis,
    mimeType: "image/png",
    hasAlpha: true,
    placement:
      overrides.placement === undefined
        ? { gravity: "southeast", widthRatio: 0.18 }
        : overrides.placement,
  };
}

function snapshot(
  overrides: Partial<CreativeWorkIdentitySnapshot> = {},
): CreativeWorkIdentitySnapshot {
  return {
    clientProfileId: "profile-1",
    confirmedAt: "2026-07-07T00:00:00.000Z",
    assets: [],
    brandKit: {
      colors: ["#000000"],
      fonts: ["Inter"],
      toneOfVoice: "Direto",
      prohibitedElements: "Sem clipart",
      requiredElements: "Logo visível",
    },
    ...overrides,
  };
}

const copy: SocialPostCopy = {
  headline: "Comece agora",
  body: "Conheça a solução.",
  cta: "Teste grátis",
};

const promptInput = {
  format: "4:5" as const,
  brief: { theme: "Matrículas", objective: "Conversão", audience: "Pais", offer: "20%" },
  copy,
  inputSnapshot: {
    request: "Campanha de julho",
    settings: { targetFormats: [] },
    sources: [{ sourceId: "source-1", updatedAt: "now", assetKey: "source.png", mimeType: "image/png", usage: "content" as const, content: { subject: "Sala de aula" }, style: { description: "Editorial" } }],
  },
  identitySnapshot: snapshot({
    assets: [
      asset({
        referenceId: "logo-exact",
        category: "logo",
        usageMode: "exact",
        placement: { gravity: "southeast", widthRatio: 0.18 },
      }),
      asset({
        referenceId: "rule-1",
        category: "graphic",
        usageMode: "rule",
        placement: null,
        analysis: analysis({
          description: "Use waves",
          rules: ["Use sparingly"],
        }),
      }),
      asset({
        referenceId: "ref-1",
        category: "visual_reference",
        usageMode: "reference",
        placement: null,
        analysis: analysis({ description: "Calm dusk" }),
      }),
    ],
  }),
  creativeLevel: "balanced" as CreativeLevel,
};

describe("buildSocialPostPrompt", () => {
  it("keeps copy and assets fixed while changing only creative level", () => {
    const conservative = buildSocialPostPrompt({ ...promptInput, creativeLevel: "conservative" });
    const bold = buildSocialPostPrompt({ ...promptInput, creativeLevel: "bold" });

    expect(conservative).toContain('HEADLINE: "Comece agora"');
    expect(bold).toContain('HEADLINE: "Comece agora"');
    expect(conservative).toContain("CREATIVE LEVEL: conservative");
    expect(bold).toContain("CREATIVE LEVEL: bold");
    expect(conservative).toContain("Minimal structural change");
    expect(bold).toContain("Dramatic background and hierarchy shift");
  });

  it("includes the non-negotiable FIXED CONTRACT block verbatim", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("FIXED CONTRACT:");
    expect(prompt).toContain('FORMAT: 4:5');
    expect(prompt).toContain('HEADLINE: "Comece agora"');
    expect(prompt).toContain('BODY: "Conheça a solução."');
    expect(prompt).toContain('CTA: "Teste grátis"');
    expect(prompt).toContain(
      "Do not paraphrase, translate, omit, or add visible copy.",
    );
    expect(prompt).toContain(
      "Exact assets will be composited after generation; leave clean space at their declared placements.",
    );
  });

  it("lists brand rules from the brand kit", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("BRAND KIT");
    expect(prompt).toContain("Direto");
    expect(prompt).toContain("Sem clipart");
    expect(prompt).toContain("Logo visível");
    expect(prompt).toContain("#000000");
    expect(prompt).toContain("Inter");
  });

  it("surfaces rule-mode findings from assets", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("RULE-MODE FINDINGS");
    expect(prompt).toContain("Use sparingly");
  });

  it("surfaces reference-mode descriptions from assets", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("REFERENCE-MODE DESCRIPTIONS");
    expect(prompt).toContain("Calm dusk");
  });

  it("tolerates null analysis on rule and reference assets without throwing", () => {
    const prompt = buildSocialPostPrompt({
      ...promptInput,
      identitySnapshot: snapshot({
        assets: [
          asset({
            referenceId: "rule-null",
            label: "rule-null",
            category: "graphic",
            usageMode: "rule",
            placement: null,
            analysis: null,
          }),
          asset({
            referenceId: "ref-null",
            label: "ref-null",
            category: "visual_reference",
            usageMode: "reference",
            placement: null,
            analysis: null,
          }),
        ],
      }),
    });

    expect(prompt).toContain("RULE-MODE FINDINGS");
    expect(prompt).toContain("rule-null");
    expect(prompt).toContain("(no description)");
    expect(prompt).toContain("REFERENCE-MODE DESCRIPTIONS");
    expect(prompt).toContain("ref-null");
  });

  it("reserves clean placement instructions for exact-mode assets", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("RESERVED PLACEMENTS");
    expect(prompt).toContain("logo-exact");
    expect(prompt).toContain("southeast");
  });

  it("includes the persisted brief and textual input analysis", () => {
    const prompt = buildSocialPostPrompt(promptInput);
    expect(prompt).toContain("Matrículas");
    expect(prompt).toContain("Campanha de julho");
    expect(prompt).toContain("Sala de aula");
    expect(prompt).toContain("Editorial");
  });
});
