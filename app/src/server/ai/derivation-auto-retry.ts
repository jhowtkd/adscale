import { env } from "../validation/env";
import { objectStorage } from "@/server/storage";
import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";
import { getDerivationById, updateDerivationPromptProvenance } from "../repositories/derivation";
import { formatToOpenAIImageSize, toOpenAISdkImageSize } from "@/lib/formats";
import { logger } from "@/lib/logger";
import {
  executeGenerationStep,
  type BuildGenerationPromptContextInput,
  type GenerationReferenceInput,
} from "./derivation-pipeline";

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
}

async function resolveAutoRetryReference(
  input: AutoRetryDerivationInput
): Promise<GenerationReferenceInput> {
  const referenceBuffer = await objectStorage.get(input.referenceKey);

  if (input.generationMode === "restyling") {
    if (!input.styleReferenceKey) {
      logger.warn(
        `[auto-retry] restyling retry missing styleReferenceKey derivationId=${input.derivationId}`
      );
      return {
        kind: "single",
        buffer: referenceBuffer,
        mimeType: input.referenceMimeType,
        allowGenerateFallback: false,
      };
    }

    const styleBuffer = await objectStorage.get(input.styleReferenceKey);
    return {
      kind: "restyling",
      baseBuffer: referenceBuffer,
      baseMimeType: input.referenceMimeType,
      styleBuffer,
      styleMimeType: input.styleReferenceMimeType ?? "image/png",
    };
  }

  return {
    kind: "single",
    buffer: referenceBuffer,
    mimeType: input.referenceMimeType,
    allowGenerateFallback: false,
  };
}

export async function runDerivationAutoRetry(
  input: AutoRetryDerivationInput
): Promise<{ outputKey: string; revisedPrompt: string } | null> {
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
    promptContext: promptContextInput,
    reference,
    isPreview: input.isPreview,
    autoRetry: { correctionFeedback: input.correctionFeedback },
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

  return { outputKey: stepResult.outputKey, revisedPrompt };
}
