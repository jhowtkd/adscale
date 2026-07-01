import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { env } from "../validation/env";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";
import { buildDerivationPrompt } from "./prompt-builder";
import type {
  Asset,
  Campaign,
  ClientReferenceContext,
  DerivationPromptConfig,
  Plan,
} from "./prompt-builder";
import type { CreativeContract, ImageOperation, SourcePackage } from "./creative-contract";
import { normalizeCreativeDiagnosis } from "./creative-diagnosis";
import {
  formatToOpenAIImageSize,
  getTargetDimensions,
  toOpenAISdkImageSize,
} from "@/lib/formats";
import type { BrandMemoryContext } from "@/server/memory/brand-memory-context";
import type { PreflightResult } from "./preflight-analysis";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

/**
 * Moved from jobs/derivation.ts (PR3, arch/refactor-2026-q3): this is pure
 * image post-processing shared by the initial generation path and the
 * auto-retry path. Living in ai/ removes the previous ai -> jobs dependency
 * that derivation-auto-retry.ts had on jobs/derivation.ts.
 */
export async function normalizeGeneratedImage(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  generationMode: "art_variation" | "format_adaptation" | "restyling",
) {
  if (generationMode === "format_adaptation") {
    return sharp(buffer)
      .resize(dimensions.width, dimensions.height, {
        fit: "cover",
        position: "attention",
      })
      .png()
      .toBuffer();
  }

  const backgroundPosition = "centre";

  const background = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "cover",
      position: backgroundPosition,
    })
    .blur(24)
    .modulate({ brightness: 0.82, saturation: 0.9 })
    .png()
    .toBuffer();

  const foreground = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** The subset of a campaign row that prompt-context building reads directly. */
export type DerivationPipelineCampaign = Campaign & {
  creativeLevel?: string | null;
  creativeDiagnosis?: unknown;
};

export type DerivationPipelineAsset = Asset & { metadata?: unknown };

export interface DerivationPipelineBrandKitInput {
  name: string;
  description?: string | null;
  visualNotes?: string | null;
  toneNotes?: string | null;
  constraints?: string | null;
  brandColors?: unknown;
  brandFonts?: unknown;
  logoAssetKey?: string | null;
  toneOfVoice?: string | null;
  prohibitedElements?: string | null;
  requiredElements?: string | null;
}

export interface DerivationPipelineCompetitorAnalysisInput {
  analysis?: unknown;
  strengths?: unknown;
  weaknesses?: unknown;
  differentiators?: unknown;
}

/**
 * Everything needed to build the `promptContext` object that
 * buildDerivationPrompt() consumes. This shape used to be constructed by
 * hand at two call sites in jobs/derivation.ts (initial generation and the
 * inline auto-retry block) — see derivation-pipeline.test.ts for the golden
 * test proving this extraction preserves the shape from the initial path.
 */
export interface BuildGenerationPromptContextInput {
  campaign: DerivationPipelineCampaign;
  plan: Plan | null | undefined;
  asset: DerivationPipelineAsset | null | undefined;
  feedback: string | null | undefined;
  locale: string | undefined;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  variantIndex: number;
  ctaText: string | null | undefined;
  targetFormat: string;
  packageSource: SourcePackage;
  clientReferences: ClientReferenceContext[];
  brandMemory: BrandMemoryContext | null | undefined;
  campaignMemoryBlock: string | null | undefined;
  contract: CreativeContract;
  brandKit: DerivationPipelineBrandKitInput | null | undefined;
  competitorAnalyses: DerivationPipelineCompetitorAnalysisInput[];
  brandTasteSection: string[] | undefined;
  corpusQualitySection: string[] | undefined;
}

export function buildGenerationPromptContext(
  input: BuildGenerationPromptContextInput
): DerivationPromptConfig {
  const {
    campaign,
    plan,
    asset,
    feedback,
    locale,
    generationMode,
    variantIndex,
    ctaText,
    targetFormat,
    packageSource,
    clientReferences,
    brandMemory,
    campaignMemoryBlock,
    contract,
    brandKit,
    competitorAnalyses,
    brandTasteSection,
    corpusQualitySection,
  } = input;

  return {
    campaign,
    plan,
    asset,
    feedback,
    locale,
    generationMode,
    variantIndex,
    ctaText,
    targetFormat,
    creativeLevel: campaign.creativeLevel ?? "balanced",
    creativeDiagnosis: normalizeCreativeDiagnosis(campaign.creativeDiagnosis) ?? null,
    packageSource,
    clientReferences: clientReferences ?? [],
    brandMemory,
    campaignMemoryBlock,
    contract,
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
    competitorAnalyses: (competitorAnalyses ?? []).map((a) => {
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
    preflightResult: asset?.metadata
      ? ((asset.metadata as Record<string, unknown>).preflightResult as PreflightResult | undefined)
      : null,
    brandTasteSection,
    corpusQualitySection,
  };
}

export type GenerationReferenceInput =
  | { kind: "none" }
  | { kind: "single"; buffer: Buffer; mimeType: string; allowGenerateFallback: boolean }
  | {
      kind: "restyling";
      baseBuffer: Buffer;
      baseMimeType: string;
      styleBuffer: Buffer;
      styleMimeType: string;
    };

export interface ExecuteGenerationStepContext {
  derivationId: string;
  promptContext: BuildGenerationPromptContextInput;
  reference: GenerationReferenceInput;
  isPreview?: boolean;
  /** When set, appends the QA correction suffix, uses a `-retry.png` key, and disables edit→generate fallback. */
  autoRetry?: { correctionFeedback: string };
}

export interface ExecuteGenerationStepResult {
  prompt: string;
  promptContext: DerivationPromptConfig;
  openaiSize: ReturnType<typeof toOpenAISdkImageSize>;
  outputKey: string;
  revisedPrompt: string;
  imageOperation: ImageOperation;
}

/**
 * Deep module for a single derivation generation attempt: build the prompt,
 * call OpenAI, normalize, and store the result. Extracted from the
 * "generate-and-store-output" step in jobs/derivation.ts and the inline
 * OpenAI call in ai/derivation-auto-retry.ts.
 *
 * Wired into derivationJob initial generation (PR4) and auto-retry (PR5,
 * arch/refactor-2026-q3). Persistence of promptProvenance before/after the
 * OpenAI call remains in the job caller for initial generation; auto-retry
 * provenance is updated inside runDerivationAutoRetry after the step returns.
 */
export async function executeGenerationStep(
  ctx: ExecuteGenerationStepContext
): Promise<ExecuteGenerationStepResult> {
  const promptContext = buildGenerationPromptContext(ctx.promptContext);
  let prompt = await buildDerivationPrompt(promptContext);
  if (ctx.autoRetry) {
    prompt = `${prompt}\n\nAUTO-RETRY CORRECTION:\nThe previous output failed QA. Fix these issues exactly:\n${ctx.autoRetry.correctionFeedback}`;
  }
  const openaiSize = toOpenAISdkImageSize(
    formatToOpenAIImageSize(ctx.promptContext.targetFormat, {
      isPreview: ctx.isPreview,
      modelName: env.OPENAI_IMAGE_MODEL,
    })
  );

  let result: OpenAI.Images.Image;
  let imageOperation: ImageOperation;

  if (ctx.reference.kind === "restyling") {
    const baseFile = await toFile(ctx.reference.baseBuffer, "base-image", {
      type: ctx.reference.baseMimeType,
    });
    const styleFile = await toFile(ctx.reference.styleBuffer, "style-reference", {
      type: ctx.reference.styleMimeType,
    });

    const response = await withTimeout(
      openai.images.edit({
        model: env.OPENAI_IMAGE_MODEL,
        image: [baseFile, styleFile],
        prompt,
        n: 1,
        size: openaiSize,
      }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "OpenAI image edit (restyling)"
    );
    const first = response.data?.[0];
    if (!first) throw new Error("No image data returned from OpenAI");
    logger.info(`[executeGenerationStep] restyling edit success`);
    result = first;
    imageOperation = "edit";
  } else if (ctx.reference.kind === "single") {
    const referenceFileName =
      ctx.promptContext.generationMode === "restyling" ? "base-image" : "reference-image";
    const referenceImage = await toFile(ctx.reference.buffer, referenceFileName, {
      type: ctx.reference.mimeType,
    });

    try {
      const response = await withTimeout(
        openai.images.edit({
          model: env.OPENAI_IMAGE_MODEL,
          image: referenceImage,
          prompt,
          n: 1,
          size: openaiSize,
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        "OpenAI image edit"
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      logger.info(`[executeGenerationStep] edit success`);
      result = first;
      imageOperation = "edit";
    } catch (editErr) {
      if (ctx.reference.allowGenerateFallback && !ctx.autoRetry) {
        logger.warn(`[executeGenerationStep] edit failed, falling back to generate:`, editErr);
        const response = await withTimeout(
          openai.images.generate({
            model: env.OPENAI_IMAGE_MODEL,
            prompt,
            n: 1,
            size: openaiSize,
          }),
          IMAGE_GENERATION_TIMEOUT_MS,
          "OpenAI image generation (fallback)"
        );
        const first = response.data?.[0];
        if (!first) throw new Error("No image data returned from OpenAI fallback");
        logger.info(`[executeGenerationStep] fallback generate success`);
        result = first;
        imageOperation = "generation_fallback";
      } else {
        throw editErr;
      }
    }
  } else {
    const response = await withTimeout(
      openai.images.generate({
        model: env.OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: openaiSize,
      }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "OpenAI image generation"
    );
    const first = response.data?.[0];
    if (!first) throw new Error("No image data returned from OpenAI");
    logger.info(`[executeGenerationStep] generate success (no asset)`);
    result = first;
    imageOperation = "generate";
  }

  let buffer: Buffer;
  if (result.b64_json) {
    buffer = Buffer.from(result.b64_json, "base64");
  } else if (result.url) {
    const imageResponse = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to download generated image: ${imageResponse.status} ${imageResponse.statusText}`
      );
    }
    buffer = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error("No image data returned");
  }

  const dimensions = getTargetDimensions(ctx.promptContext.targetFormat, ctx.isPreview);
  if (dimensions) {
    buffer = await normalizeGeneratedImage(buffer, dimensions, ctx.promptContext.generationMode);
  }

  const key = ctx.autoRetry
    ? `derivations/${ctx.derivationId}/${Date.now()}-retry.png`
    : `derivations/${ctx.derivationId}/${Date.now()}.png`;
  await objectStorage.put(key, buffer, "image/png");

  const revisedPrompt = result.revised_prompt || "";

  return {
    prompt,
    promptContext,
    openaiSize,
    outputKey: key,
    revisedPrompt,
    imageOperation,
  };
}
