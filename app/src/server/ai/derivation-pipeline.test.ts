import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeCreativeDiagnosis } from "./creative-diagnosis";
import { artVariationContractFixture, campaignFixture } from "./prompt-builder.test-fixtures";
import type { DerivationPromptConfig } from "./prompt-builder";
import type {
  BuildGenerationPromptContextInput,
  DerivationPipelineCampaign,
} from "./derivation-pipeline";

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = mockOpenAIImages;
  },
  toFile: vi.fn((buffer: Buffer, name: string, opts: { type: string }) => ({
    buffer,
    name,
    type: opts.type,
  })),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn((key: string) => Promise.resolve(Buffer.from(`buffer:${key}`))),
    put: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
  },
}));

vi.mock("./prompt-builder", async () => {
  const actual = await vi.importActual<typeof import("./prompt-builder")>("./prompt-builder");
  return {
    ...actual,
    buildDerivationPrompt: vi.fn(() => Promise.resolve("built prompt")),
  };
});

// sharp is exercised elsewhere (jobs/derivation.test.ts); stub it here so this
// file stays focused on prompt-context and OpenAI orchestration behavior.
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    blur: vi.fn().mockReturnThis(),
    modulate: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(() => Promise.resolve(Buffer.from("normalized"))),
  })),
}));

import { objectStorage } from "@/server/storage";
import { buildDerivationPrompt } from "./prompt-builder";
import {
  buildGenerationPromptContext,
  executeGenerationStep,
} from "./derivation-pipeline";

function canonicalCampaign(): DerivationPipelineCampaign {
  return {
    ...campaignFixture(),
    creativeLevel: "bold",
    creativeDiagnosis: {
      detectedConcept: "Urgency-led promo card",
      elementsToPreserve: ["Ver ofertas CTA"],
      variationOpportunities: ["Tighten hierarchy"],
    },
  };
}

/**
 * MANDATORY golden test fixture (PR3, arch/refactor-2026-q3).
 *
 * This is a byte-for-byte copy of the promptContext object literal that,
 * as of this PR, is still constructed inline inside the
 * "generate-and-store-output" step in jobs/derivation.ts (the initial /
 * canonical generation path — see lines around `buildDerivationPrompt({...`
 * in that file). It is NOT imported from production code on purpose: the
 * job has not been migrated to buildGenerationPromptContext() yet (that is
 * PR4). Keeping a pinned copy here lets this test fail loudly if either
 * side drifts, which is exactly the contract PR4 needs before it can safely
 * swap the real call site over to buildGenerationPromptContext().
 */
function currentJobPathPromptContext(
  input: BuildGenerationPromptContextInput
): DerivationPromptConfig {
  const {
    campaign,
    plan,
    asset: promptAsset,
    feedback,
    locale,
    generationMode: effectiveGenerationMode,
    variantIndex,
    ctaText: effectiveCtaText,
    targetFormat,
    packageSource: sourcePackage,
    clientReferences,
    brandMemory,
    campaignMemoryBlock,
    contract: resolvedContract,
    brandKit,
    competitorAnalyses,
    brandTasteSection,
    corpusQualitySection,
  } = input;

  return {
    campaign,
    plan,
    asset: promptAsset,
    feedback,
    locale,
    generationMode: effectiveGenerationMode,
    variantIndex,
    ctaText: effectiveCtaText,
    targetFormat,
    creativeLevel: campaign.creativeLevel ?? "balanced",
    creativeDiagnosis: normalizeCreativeDiagnosis(campaign.creativeDiagnosis) ?? null,
    packageSource: sourcePackage,
    clientReferences,
    brandMemory,
    campaignMemoryBlock,
    contract: resolvedContract,
    brandKit: brandKit
      ? {
          name: brandKit.name,
          description: brandKit.description ?? undefined,
          visualNotes: brandKit.visualNotes ?? undefined,
          toneNotes: brandKit.toneNotes ?? undefined,
          constraints: brandKit.constraints ?? undefined,
          colors: Array.isArray(brandKit.brandColors) ? (brandKit.brandColors as string[]) : undefined,
          fonts: Array.isArray(brandKit.brandFonts) ? (brandKit.brandFonts as string[]) : undefined,
          logoAssetKey: brandKit.logoAssetKey ?? undefined,
          toneOfVoice: brandKit.toneOfVoice ?? undefined,
          prohibitedElements: brandKit.prohibitedElements ?? undefined,
          requiredElements: brandKit.requiredElements ?? undefined,
        }
      : null,
    competitorAnalyses: competitorAnalyses.map((a) => {
      const analysis = (a.analysis ?? {}) as Record<string, unknown>;
      const vp = analysis.visualPatterns as Record<string, unknown> | undefined;
      const msg = analysis.messaging as Record<string, unknown> | undefined;
      return {
        visualPatterns: {
          colors: Array.isArray(vp?.colors) ? (vp.colors as string[]) : undefined,
          composition: typeof vp?.composition === "string" ? vp.composition : undefined,
          typography: typeof vp?.typography === "string" ? vp.typography : undefined,
        },
        messaging: {
          headlineStyle: typeof msg?.headlineStyle === "string" ? msg.headlineStyle : undefined,
          ctaStyle: typeof msg?.ctaStyle === "string" ? msg.ctaStyle : undefined,
          offerType: typeof msg?.offerType === "string" ? msg.offerType : undefined,
        },
        strengths: Array.isArray(a.strengths) ? (a.strengths as string[]) : [],
        weaknesses: Array.isArray(a.weaknesses) ? (a.weaknesses as string[]) : [],
        differentiationOpportunities: Array.isArray(a.differentiators)
          ? (a.differentiators as string[])
          : [],
      };
    }),
    preflightResult: promptAsset?.metadata
      ? ((promptAsset.metadata as Record<string, unknown>).preflightResult as
          | DerivationPromptConfig["preflightResult"]
          | undefined)
      : null,
    brandTasteSection,
    corpusQualitySection,
  };
}

function canonicalPromptContextInput(): BuildGenerationPromptContextInput {
  return {
    campaign: canonicalCampaign(),
    plan: {
      id: "plan-1",
      strategy: "Urgency-led social proof",
      angles: ["Limited-time audit"],
      hooks: ["Garanta sua vaga"],
      ctas: ["Ver ofertas"],
    },
    asset: {
      id: "asset-campaign-1",
      campaignId: "campaign-1",
      workspaceId: "workspace-1",
      key: "uploads/reference.png",
      type: "image/png",
      size: 2048,
      width: 1080,
      height: 1080,
      createdAt: new Date("2026-06-01"),
      metadata: { preflightResult: { warnings: ["low_contrast_cta"], blockers: [] } },
    },
    feedback: "Increase contrast on the CTA module",
    locale: "pt-BR",
    generationMode: "art_variation",
    variantIndex: 2,
    ctaText: "Comprar agora",
    targetFormat: "1:1",
    packageSource: "campaign_asset",
    clientReferences: [
      { id: "ref-1", kind: "style", label: "Estilo aprovado", notes: null, assetKey: "refs/style.png" },
    ],
    brandMemory: {
      items: [{ source: "fact", text: "Brand previously used CTA Ver ofertas." }],
      block: "BRAND MEMORY / LEARNED CONTEXT:\n- Brand previously used CTA Ver ofertas.",
    },
    campaignMemoryBlock: "CAMPAIGN MEMORY:\n- Avoid neon glow backgrounds.",
    contract: artVariationContractFixture(),
    brandKit: {
      name: "Acme Corp",
      description: "SaaS for SMB marketers",
      visualNotes: "Rounded corners, high contrast",
      toneNotes: "Confident, direct",
      constraints: "Preserve LGPD badge",
      brandColors: ["#111827", "#F59E0B"],
      brandFonts: ["Inter"],
      logoAssetKey: "brand/logo.png",
      toneOfVoice: "Confident",
      prohibitedElements: ["stock photos of handshakes"],
      requiredElements: ["LGPD badge"],
    },
    competitorAnalyses: [
      {
        analysis: {
          visualPatterns: { colors: ["#000000"], composition: "grid", typography: "sans-serif" },
          messaging: { headlineStyle: "bold", ctaStyle: "urgent", offerType: "discount" },
        },
        strengths: ["Clear CTA"],
        weaknesses: ["Cluttered layout"],
        differentiators: ["Faster onboarding"],
      },
    ],
    brandTasteSection: ["Prefer editorial composition over dashboard-style grids."],
    corpusQualitySection: ["Avoid neon glow stacks."],
  };
}

describe("buildGenerationPromptContext", () => {
  it("matches the promptContext shape produced by the current job path (golden test)", () => {
    const input = canonicalPromptContextInput();

    const extracted = buildGenerationPromptContext(input);
    const current = currentJobPathPromptContext(input);

    expect(extracted).toEqual(current);
  });

  it("matches the current job path when brandKit, competitorAnalyses, and metadata are absent", () => {
    const input: BuildGenerationPromptContextInput = {
      ...canonicalPromptContextInput(),
      asset: undefined,
      brandKit: null,
      competitorAnalyses: [],
      brandTasteSection: undefined,
      corpusQualitySection: undefined,
    };

    const extracted = buildGenerationPromptContext(input);
    const current = currentJobPathPromptContext(input);

    expect(extracted).toEqual(current);
    expect(extracted.brandKit).toBeNull();
    expect(extracted.preflightResult).toBeNull();
  });

  it("falls back creativeLevel to balanced and normalizes creativeDiagnosis", () => {
    const input = canonicalPromptContextInput();
    input.campaign = { ...campaignFixture() };

    const result = buildGenerationPromptContext(input);

    expect(result.creativeLevel).toBe("balanced");
    expect(result.creativeDiagnosis).toBeNull();
  });
});

describe("executeGenerationStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised prompt" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised prompt" }],
    });
  });

  it("uses image edit for a single reference and uploads the normalized output", async () => {
    const result = await executeGenerationStep({
      workspaceId: "ws-1",
      derivationId: "derivation-1",
      promptContext: canonicalPromptContextInput(),
      reference: {
        kind: "single",
        buffer: Buffer.from("reference"),
        mimeType: "image/png",
        allowGenerateFallback: false,
      },
    });

    expect(buildDerivationPrompt).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.edit).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.generate).not.toHaveBeenCalled();
    expect(result.imageOperation).toBe("edit");
    expect(result.revisedPrompt).toBe("revised prompt");
    expect(result.outputKey).toMatch(/^derivations\/derivation-1\/\d+\.png$/);
    expect(objectStorage.put).toHaveBeenCalledWith(
      result.outputKey,
      expect.any(Buffer),
      "image/png"
    );
  });

  it("falls back to generate when edit fails and allowGenerateFallback is true", async () => {
    mockOpenAIImages.edit.mockRejectedValueOnce(new Error("edit unsupported"));

    const result = await executeGenerationStep({
      workspaceId: "ws-1",
      derivationId: "derivation-2",
      promptContext: {
        ...canonicalPromptContextInput(),
        generationMode: "format_adaptation",
      },
      reference: {
        kind: "single",
        buffer: Buffer.from("reference"),
        mimeType: "image/png",
        allowGenerateFallback: true,
      },
    });

    expect(mockOpenAIImages.edit).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.generate).toHaveBeenCalledTimes(1);
    expect(result.imageOperation).toBe("generation_fallback");
  });

  it("rethrows the edit error when the reference does not allow a generate fallback", async () => {
    mockOpenAIImages.edit.mockRejectedValueOnce(new Error("edit unsupported"));

    await expect(
      executeGenerationStep({
      workspaceId: "ws-1",
        derivationId: "derivation-3",
        promptContext: canonicalPromptContextInput(),
        reference: {
          kind: "single",
          buffer: Buffer.from("reference"),
          mimeType: "image/png",
          allowGenerateFallback: false,
        },
      })
    ).rejects.toThrow("edit unsupported");

    expect(mockOpenAIImages.generate).not.toHaveBeenCalled();
  });

  it("uses image edit with both images for restyling", async () => {
    const result = await executeGenerationStep({
      workspaceId: "ws-1",
      derivationId: "derivation-4",
      promptContext: {
        ...canonicalPromptContextInput(),
        generationMode: "restyling",
      },
      reference: {
        kind: "restyling",
        baseBuffer: Buffer.from("base"),
        baseMimeType: "image/png",
        styleBuffer: Buffer.from("style"),
        styleMimeType: "image/png",
      },
    });

    expect(mockOpenAIImages.edit).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ image: [expect.anything(), expect.anything()] })
    );
    expect(result.imageOperation).toBe("edit");
  });

  it("sends the campaign source and approved brand references as real images", async () => {
    await executeGenerationStep({
      workspaceId: "ws-1",
      derivationId: "derivation-brand-references",
      promptContext: canonicalPromptContextInput(),
      reference: {
        kind: "multi",
        images: [
          { buffer: Buffer.from("base"), mimeType: "image/png", name: "campaign-source" },
          { buffer: Buffer.from("brand-a"), mimeType: "image/png", name: "brand-reference-a" },
          { buffer: Buffer.from("brand-b"), mimeType: "image/jpeg", name: "brand-reference-b" },
        ],
      },
    });

    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ image: [expect.anything(), expect.anything(), expect.anything()] }),
    );
  });

  it("uses image generate when there is no reference", async () => {
    const result = await executeGenerationStep({
      workspaceId: "ws-1",
      derivationId: "derivation-5",
      promptContext: canonicalPromptContextInput(),
      reference: { kind: "none" },
    });

    expect(mockOpenAIImages.generate).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.edit).not.toHaveBeenCalled();
    expect(result.imageOperation).toBe("generate");
  });

  it("appends auto-retry correction suffix and uses -retry.png output key", async () => {
    const result = await executeGenerationStep({
      workspaceId: "ws-1",
      derivationId: "derivation-retry",
      promptContext: canonicalPromptContextInput(),
      reference: {
        kind: "single",
        buffer: Buffer.from("reference"),
        mimeType: "image/png",
        allowGenerateFallback: true,
      },
      autoRetry: { correctionFeedback: "Fix CTA drift" },
    });

    expect(buildDerivationPrompt).toHaveBeenCalled();
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("AUTO-RETRY CORRECTION"),
      })
    );
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Fix CTA drift"),
      })
    );
    expect(result.outputKey).toMatch(/^derivations\/derivation-retry\/\d+-retry\.png$/);
    expect(mockOpenAIImages.generate).not.toHaveBeenCalled();
  });

  it("does not fall back to generate on auto-retry when edit fails", async () => {
    mockOpenAIImages.edit.mockRejectedValueOnce(new Error("edit unsupported"));

    await expect(
      executeGenerationStep({
      workspaceId: "ws-1",
        derivationId: "derivation-retry-fail",
        promptContext: {
          ...canonicalPromptContextInput(),
          generationMode: "format_adaptation",
        },
        reference: {
          kind: "single",
          buffer: Buffer.from("reference"),
          mimeType: "image/png",
          allowGenerateFallback: true,
        },
        autoRetry: { correctionFeedback: "Fix layout" },
      })
    ).rejects.toThrow("edit unsupported");

    expect(mockOpenAIImages.generate).not.toHaveBeenCalled();
  });
});
