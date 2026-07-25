import { env } from "../validation/env";
import { objectStorage } from "@/server/storage";
import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";
import { getDerivationById, updateDerivationPromptProvenance } from "../repositories/derivation";
import { formatToOpenAIImageSize, toOpenAISdkImageSize } from "@/lib/formats";
import { logger } from "@/lib/logger";
import { normalizeImageForAi } from "@/server/ai/normalize-image-for-ai";
import {
  executeGenerationStep,
  type BuildGenerationPromptContextInput,
  type GenerationReferenceInput,
} from "./derivation-pipeline";
import type { GenerationCandidateMeta } from "./image-generation";

export { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";

export interface AutoRetryDerivationInput {
  derivationId: string;
  workspaceId: string;
  campaignId: string;
  referenceKey: string;
  referenceMimeType: string;
  styleReferenceKey?: string;
  styleReferenceMimeType?: string;
  correctionFeedback: string;
  promptContext: BuildGenerationPromptContextInput;
  contract: CreativeContract;
  targetFormat: string;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  isPreview?: boolean;
  inngestRunId?: string;
  inngestAttempt?: number;
}

async function resolveAutoRetryReference(
  input: AutoRetryDerivationInput
): Promise<GenerationReferenceInput> {
  const referenceRaw = await objectStorage.get(input.referenceKey);
  const referenceNormalized = await normalizeImageForAi({
    buffer: referenceRaw,
    mimeType: input.referenceMimeType,
  });

  if (input.generationMode === "restyling") {
    if (!input.styleReferenceKey) {
      logger.warn(
        `[auto-retry] restyling retry missing styleReferenceKey derivationId=${input.derivationId}`
      );
      return {
        kind: "single",
        buffer: referenceNormalized.buffer,
        mimeType: referenceNormalized.mimeType,
        allowGenerateFallback: false,
      };
    }

    const styleRaw = await objectStorage.get(input.styleReferenceKey);
    const styleNormalized = await normalizeImageForAi({
      buffer: styleRaw,
      mimeType: input.styleReferenceMimeType ?? "image/png",
    });
    return {
      kind: "restyling",
      baseBuffer: referenceNormalized.buffer,
      baseMimeType: referenceNormalized.mimeType,
      styleBuffer: styleNormalized.buffer,
      styleMimeType: styleNormalized.mimeType,
    };
  }

  return {
    kind: "single",
    buffer: referenceNormalized.buffer,
    mimeType: referenceNormalized.mimeType,
    allowGenerateFallback: false,
  };
}

export async function runDerivationAutoRetry(
  input: AutoRetryDerivationInput
): Promise<{
  outputKey: string;
  revisedPrompt: string;
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
} | null> {
  const row = await getDerivationById(input.derivationId, input.workspaceId);
  if (!row) return null;

  const hardFailures = Array.isArray(row.hardFailures)
    ? (row.hardFailures as CreativeHardFailure[])
    : [];
  const generationLog = row.generationLog as { autoRetryAttempted?: boolean } | null;
  if (
    !shouldAutoRetryDerivation(
      input.generationMode,
      hardFailures,
      generationLog?.autoRetryAttempted
    )
  ) {
    return null;
  }

  logger.info(`[auto-retry] derivationId=${input.derivationId} failures=${hardFailures.map((f) => f.code).join(",")}`);

  const reference = await resolveAutoRetryReference(input);
  const promptContextInput: BuildGenerationPromptContextInput = {
    ...input.promptContext,
    feedback: input.correctionFeedback,
  };

  const stepResult = await executeGenerationStep({
    derivationId: input.derivationId,
    workspaceId: input.workspaceId,
    promptContext: promptContextInput,
    reference,
    isPreview: input.isPreview,
    surface: "campaign",
    autoRetry: { correctionFeedback: input.correctionFeedback },
    inngestRunId: input.inngestRunId,
    inngestAttempt: input.inngestAttempt,
  });

  const openaiSize = toOpenAISdkImageSize(
    formatToOpenAIImageSize(input.targetFormat, {
      isPreview: input.isPreview,
      modelName: env.OPENAI_IMAGE_MODEL,
    })
  );

  const revisedPrompt = stepResult.revisedPrompt;

  await updateDerivationPromptProvenance(input.derivationId, input.workspaceId, {
    creativeContract: input.contract,
    promptProvenance: {
      ...(row.promptProvenance ?? {
        schemaVersion: 1,
        inputPrompt: stepResult.prompt,
        model: env.OPENAI_IMAGE_MODEL,
        requestedSize: openaiSize,
        sourcePackage: "campaign_asset",
        source: null,
        generationMode: input.generationMode,
        targetFormat: input.targetFormat,
      }),
      inputPrompt: stepResult.prompt,
      revisedPrompt,
      imageOperation: "edit",
      outputKey: stepResult.outputKey,
    },
    inputPrompt: stepResult.prompt,
    prompt: revisedPrompt,
  });

  return { outputKey: stepResult.outputKey, revisedPrompt, candidates: stepResult.candidates };
}
