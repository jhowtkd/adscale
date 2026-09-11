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
  DEFAULT_IMAGE_PROVIDER_CALL_BUDGET,
  isRetryableProviderError,
  type GenerationMode as ProviderGenerationMode,
  type ImagePipelineTelemetryContext,
} from "@/server/ai/image-generation";
import { planCreativeRoutes } from "@/server/ai/creative-route-planner";
import { selectCreativeCandidate } from "@/server/ai/creative-candidate-selector";
import { observeImagePipelineExternalCall } from "@/server/ai/image-pipeline-telemetry";
import {
  assertGenerationRequest,
  type GenerationRequest,
  type GenerationResult,
} from "@/server/generation/canonical/types";

export type ExecuteCanonicalGenerationOptions = {
  telemetry?: ImagePipelineTelemetryContext;
  onStageHeartbeat?: (stage: string) => Promise<void>;
  /** Shared across edit + generate-fallback so total provider calls stay ≤ 6. */
  callBudget?: { remaining: number };
};

function isProviderGenerationFailure(error: unknown): boolean {
  if (isRetryableProviderError(error)) return true;
  if (
    error instanceof Error &&
    /All image candidates failed/i.test(error.message)
  ) {
    return true;
  }
  if (
    error &&
    typeof error === "object" &&
    (("status" in error && typeof (error as { status?: unknown }).status === "number") ||
      ("statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number"))
  ) {
    return true;
  }
  return false;
}

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
  request: GenerationRequest,
  options?: ExecuteCanonicalGenerationOptions,
): Promise<GenerationResult> {
  assertGenerationRequest(request);

  logger.info(
    `[executeCanonicalGeneration] surface=${request.surface} destination=${request.destination.kind}:${request.destination.id} mode=${request.intent.mode}`
  );

  let routes: Array<{ id: string; prompt: string }> | undefined;
  // R-001: under the v1 direct policy the executor never invokes the route
  // planner, the judge or hidden candidates for a Creative Work output —
  // one visible output means one provider call.
  const directExecution = request.executionPolicy === "direct";
  const destinationTelemetry: ImagePipelineTelemetryContext = {
    workspaceId: request.authorship.workspaceId,
    jobType:
      request.surface === "quick_tool"
        ? "creative_work"
        : request.surface === "assistant"
          ? "assistant"
          : "derivation",
    workId: request.destination.workItemId,
    outputId: request.destination.kind === "creative_work_output" ? request.destination.id : undefined,
    derivationId: request.destination.kind === "derivation" ? request.destination.id : undefined,
    generationCorrelationId: request.destination.generationCorrelationId,
    campaignId: request.destination.campaignId,
    ...options?.telemetry,
  };
  if (request.intent.mode === "social_post" && !directExecution) {
    try {
      const plannedRoutes = await observeImagePipelineExternalCall({
        callType: "planner",
        attempt: request.attempt ?? 0,
        ...destinationTelemetry,
      }, () => planCreativeRoutes({
        sourcePrompt: request.prompt.text,
        objective: request.intent.objective,
        mode: request.intent.mode,
        referenceNames: request.identity.referenceImages.map((reference) => reference.name),
      }));
      routes = plannedRoutes.map((route) => ({
        id: route.id,
        prompt: `${route.renderPrompt}\n\nPRESERVE:\n${route.preserve.join("\n")}\n\nAVOID:\n${route.avoid.join("\n")}\n\nMANDATORY CONTRACT:\n${request.prompt.text}`,
      }));
    } catch (error) {
      logger.warn("[executeCanonicalGeneration] creative route planning failed; using direct prompt", error);
    }
  }

  const result = await generateAndStoreImage({
    prompt: request.prompt.text,
    dimensions: request.format.dimensions,
    outputPrefix: request.destination.storagePrefix,
    attempt: request.attempt ?? 0,
    referenceImages: request.identity.referenceImages,
    generationMode: toProviderMode(request.intent.mode),
    outputSuffix: request.source.outputSuffix ?? "",
    executionPolicy: request.executionPolicy,
    routes,
    telemetry: destinationTelemetry,
    onStageHeartbeat: options?.onStageHeartbeat,
    callBudget: options?.callBudget,
    renderPolicy: request.renderPolicy,
    selectCandidate: routes
      ? async (candidates) => {
          const selection = await observeImagePipelineExternalCall({
            callType: "selector",
            attempt: request.attempt ?? 0,
            ...destinationTelemetry,
          }, () => selectCreativeCandidate({
            candidates,
            brief: request.prompt.text,
            objective: request.intent.objective,
            brandConstraints: request.identity.brandConstraints,
            targetFormat: request.format.targetFormat,
            referenceImages: request.identity.referenceImages,
          }));
          logger.info(
            `[executeCanonicalGeneration] selected route=${candidates[selection.winnerIndex]?.routeId} reason=${selection.reason}`
          );
          return {
            winnerIndex: selection.winnerIndex,
            refinementPrompt: selection.refinementPrompt,
            reason: selection.reason,
          };
        }
      : undefined,
  });

  return {
    outputKey: result.outputKey,
    revisedPrompt: result.revisedPrompt,
    buffer: result.buffer,
    imageOperation: result.imageOperation,
    providerCalls: result.providerCalls,
    providerRetries: result.providerRetries,
    candidates: result.candidates,
    excludedCalls: result.excludedCalls,
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
  request: GenerationRequest,
  options?: ExecuteCanonicalGenerationOptions,
): Promise<GenerationResult> {
  assertGenerationRequest(request);

  const callBudget = options?.callBudget ?? { remaining: DEFAULT_IMAGE_PROVIDER_CALL_BUDGET };
  const sharedOptions: ExecuteCanonicalGenerationOptions = {
    ...options,
    callBudget,
  };

  try {
    return await executeCanonicalGeneration(request, sharedOptions);
  } catch (editErr) {
    if (
      !request.source.allowGenerateFallback ||
      request.identity.referenceImages.length === 0 ||
      request.source.outputSuffix ||
      callBudget.remaining <= 0 ||
      !isProviderGenerationFailure(editErr)
    ) {
      throw editErr;
    }
    logger.warn(
      `[executeCanonicalGeneration] edit failed, falling back to generate without references (budgetRemaining=${callBudget.remaining})`,
      editErr
    );
    const fallbackRequest: GenerationRequest = {
      ...request,
      identity: { ...request.identity, referenceImages: [] },
      source: { ...request.source, allowGenerateFallback: false },
    };
    const result = await executeCanonicalGeneration(fallbackRequest, sharedOptions);
    return { ...result, imageOperation: "generation_fallback" };
  }
}
