import { env } from "../validation/env";
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
import {
  generateAndStoreImage,
  normalizeGeneratedImage,
  type GenerateAndStoreImageReference,
  type GenerationCandidateMeta,
} from "./image-generation";

// Re-export for backward compatibility — jobs/derivation.ts and the
// derivation-pipeline test import normalizeGeneratedImage from this module.
export { normalizeGeneratedImage };

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
      kind: "multi";
      images: Array<{ buffer: Buffer; mimeType: string; name: string }>;
    }
  | {
      kind: "restyling";
      baseBuffer: Buffer;
      baseMimeType: string;
      styleBuffer: Buffer;
      styleMimeType: string;
      brandImages?: Array<{ buffer: Buffer; mimeType: string; name: string }>;
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
  /**
   * Per-provider candidate summary from the dual-engine orchestrator. Always
   * present after Task 6; the array has 1 or 2 entries depending on how many
   * providers succeeded. Persisted on the derivation row so the UI, QA, and
   * analytics can see which providers ran and which won.
   */
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
}

function referenceToInputs(
  reference: GenerationReferenceInput,
  generationMode: "art_variation" | "format_adaptation" | "restyling"
): GenerateAndStoreImageReference[] {
  if (reference.kind === "restyling") {
    return [
      { buffer: reference.baseBuffer, mimeType: reference.baseMimeType, name: "base-image" },
      { buffer: reference.styleBuffer, mimeType: reference.styleMimeType, name: "style-reference" },
      ...(reference.brandImages ?? []),
    ].slice(0, 4);
  }
  if (reference.kind === "single") {
    const fileName = generationMode === "restyling" ? "base-image" : "reference-image";
    return [{ buffer: reference.buffer, mimeType: reference.mimeType, name: fileName }];
  }
  if (reference.kind === "multi") {
    return reference.images;
  }
  return [];
}

/**
 * Deep module for a single derivation generation attempt: build the prompt,
 * call OpenAI, normalize, and store the result. The provider-side work is
 * delegated to `generateAndStoreImage` in `image-generation.ts`; this wrapper
 * handles campaign-specific prompt construction and translates
 * `GenerationReferenceInput` into the helper's `referenceImages` shape.
 *
 * Persistence of promptProvenance before/after the provider call remains in
 * the job caller (see jobs/derivation.ts and derivation-auto-retry.ts).
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

  const targetFormat = ctx.promptContext.targetFormat as "1:1" | "4:5" | "9:16";
  const referenceImages = referenceToInputs(ctx.reference, ctx.promptContext.generationMode);
  const outputPrefix = `derivations/${ctx.derivationId}`;
  const outputSuffix = ctx.autoRetry ? "-retry" : "";

  // Resolve target dimensions here so the campaign-neutral helper does not
  // need to know about preview semantics. Passing already-resolved dimensions
  // restores the pre-refactor behavior for preview flows.
  const dimensions =
    getTargetDimensions(targetFormat, ctx.isPreview) ?? { width: 1024, height: 1024 };

  let result: {
    outputKey: string;
    revisedPrompt: string;
    imageOperation: ImageOperation;
    candidates: (GenerationCandidateMeta & { winner: boolean })[];
  };
  try {
    result = await generateAndStoreImage({
      prompt,
      dimensions,
      outputPrefix,
      referenceImages,
      generationMode: ctx.promptContext.generationMode,
      outputSuffix,
    });
  } catch (editErr) {
    // Preserve the historical single-reference fallback: retry without the
    // reference image. Only enabled when `allowGenerateFallback` is set and
    // we are NOT in an auto-retry context.
    if (
      ctx.reference.kind === "single" &&
      ctx.reference.allowGenerateFallback &&
      !ctx.autoRetry
    ) {
      logger.warn(
        `[executeGenerationStep] edit failed, falling back to generate:`,
        editErr
      );
      result = await generateAndStoreImage({
        prompt,
        dimensions,
        outputPrefix,
        referenceImages: [],
        generationMode: ctx.promptContext.generationMode,
        outputSuffix,
      });
      // Mark the operation so callers can distinguish the fallback path.
      result = { ...result, imageOperation: "generation_fallback" };
    } else {
      throw editErr;
    }
  }

  return {
    prompt,
    promptContext,
    openaiSize,
    outputKey: result.outputKey,
    revisedPrompt: result.revisedPrompt,
    imageOperation: result.imageOperation,
    candidates: result.candidates,
  };
}
