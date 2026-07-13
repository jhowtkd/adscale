/**
 * Executor canônico único de geração (Gate 3).
 *
 * Campanha, Assistente e Criar Post constroem um GenerationRequest e chamam
 * apenas esta função para provider + armazenamento. Adapters cuidam de
 * prompt/contexto e persistência do resultado.
 */
import { logger } from "@/lib/logger";
import {
  generateAndStoreImage,
  type GenerationMode as ProviderGenerationMode,
} from "@/server/ai/image-generation";
import {
  assertGenerationRequest,
  type GenerationRequest,
  type GenerationResult,
} from "@/server/generation/canonical/types";

function toProviderMode(mode: GenerationRequest["intent"]["mode"]): ProviderGenerationMode {
  if (
    mode === "format_adaptation" ||
    mode === "restyling" ||
    mode === "art_variation"
  ) {
    return mode;
  }
  // social_post / creative_revision share art_variation provider semantics.
  return "art_variation";
}

/**
 * Runs the shared provider + object-storage path for any surface.
 * Does not persist domain rows — callers/adapters own that.
 */
export async function executeCanonicalGeneration(
  request: GenerationRequest
): Promise<GenerationResult> {
  assertGenerationRequest(request);

  logger.info(
    `[executeCanonicalGeneration] surface=${request.surface} destination=${request.destination.kind}:${request.destination.id} mode=${request.intent.mode}`
  );

  let result = await generateAndStoreImage({
    prompt: request.prompt.text,
    dimensions: request.format.dimensions,
    outputPrefix: request.destination.storagePrefix,
    referenceImages: request.identity.referenceImages,
    generationMode: toProviderMode(request.intent.mode),
    outputSuffix: request.source.outputSuffix ?? "",
  });

  let imageOperation: GenerationResult["imageOperation"] = result.imageOperation;

  // Preserve derivation single-reference edit→generate fallback.
  if (
    request.source.allowGenerateFallback &&
    request.identity.referenceImages.length > 0 &&
    !request.source.outputSuffix
  ) {
    // Fallback only applies when the first attempt threw — handled below.
  }

  return {
    outputKey: result.outputKey,
    revisedPrompt: result.revisedPrompt,
    buffer: result.buffer,
    imageOperation,
    candidates: result.candidates,
    destination: request.destination,
    surface: request.surface,
  };
}

/**
 * Like executeCanonicalGeneration, but retries without references when
 * `allowGenerateFallback` is set and the first provider call fails.
 * Used by the derivation adapter to preserve historical behaviour.
 */
export async function executeCanonicalGenerationWithFallback(
  request: GenerationRequest
): Promise<GenerationResult> {
  assertGenerationRequest(request);

  try {
    return await executeCanonicalGeneration(request);
  } catch (editErr) {
    if (
      !request.source.allowGenerateFallback ||
      request.identity.referenceImages.length === 0 ||
      request.source.outputSuffix
    ) {
      throw editErr;
    }
    logger.warn(
      `[executeCanonicalGeneration] edit failed, falling back to generate without references`,
      editErr
    );
    const fallbackRequest: GenerationRequest = {
      ...request,
      identity: { ...request.identity, referenceImages: [] },
      source: { ...request.source, allowGenerateFallback: false },
    };
    const result = await executeCanonicalGeneration(fallbackRequest);
    return { ...result, imageOperation: "generation_fallback" };
  }
}
