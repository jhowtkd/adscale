import sharp from "sharp";
import pLimit from "p-limit";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";

// The generation path shares a 512 MB instance with the web server. sharp's
// default in-process cache retains decoded pixel data between operations;
// that residency is worth more as headroom than as cache hits here. (Guarded
// because unit tests replace the sharp module with a minimal mock.)
if (typeof sharp.cache === "function") sharp.cache(false);
import { recordDualEngineCandidates } from "./generation-log";
import { OpenAIImageProvider } from "./providers/openai-image-provider";
import {
  E2EControlledImageProvider,
  isE2EControlledProviderEnabled,
} from "./providers/e2e-controlled-provider";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ImageReference,
  ProviderGenerateInput,
} from "./providers/image-provider";
import { getImageRouteConcurrency } from "./image-runtime-config";
import { createPipelineTimer, logImagePipelineStage } from "./image-pipeline-telemetry";

export type GenerateAndStoreImageReference = ImageReference;

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

export type GenerationCandidateMeta = {
  provider: "openai";
  routeId?: string;
  model: string;
  outputKey: string;
  durationMs: number;
  score?: number;
  quality?: "invalid" | "improvable" | "acceptable";
  costCredits?: number;
  rawRequestId?: string;
  revisedPrompt?: string;
  selectionReason?: string;
};

export type ImagePipelineTelemetryContext = {
  workId?: string;
  outputId?: string;
  workspaceId?: string;
  campaignId?: string;
  derivationId?: string;
  inngestRunId?: string;
  inngestAttempt?: number;
  jobType?: "derivation" | "creative_work" | "brand_training" | "assistant";
};

export interface GenerateAndStoreImageInput {
  prompt: string;
  dimensions: { width: number; height: number };
  outputPrefix: string;
  referenceImages: ImageReference[];
  attempt?: number;
  generationMode?: GenerationMode;
  quality?: "medium" | "high";
  routes?: Array<{ id: string; prompt: string }>;
  selectCandidate?: (candidates: Array<{
    routeId: string;
    outputKey?: string;
    buffer?: Buffer;
    mimeType: string;
    imageUrl?: string;
    score?: number;
  }>) => Promise<number | {
    winnerIndex: number;
    refinementPrompt?: string;
    reason?: string;
  }>;
  outputSuffix?: string;
  telemetry?: ImagePipelineTelemetryContext;
  /** Called after heavy sub-stages so the job can renew its processing lease. */
  onStageHeartbeat?: (stage: string) => Promise<void>;
  /**
   * Shared provider-call budget (default 6). Edit+generate fallback must
   * pass the same mutable counter so both paths cannot exceed six calls.
   */
  callBudget?: { remaining: number };
}

export const DEFAULT_IMAGE_PROVIDER_CALL_BUDGET = 6;

export interface GenerateAndStoreImageResult {
  outputKey: string;
  revisedPrompt: string;
  imageOperation: "generate" | "edit";
  buffer: Buffer;
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
  providerCalls: number;
  providerRetries: number;
}

/** Metadata-only candidate after upload; buffer kept only when signed URL is unavailable. */
type StoredCandidate = {
  routeId: string;
  outputKey: string;
  mimeType: string;
  providerMeta: ImageCandidate["providerMeta"];
  imageUrl?: string;
  buffer?: Buffer;
  bytes: number;
};

let cachedProvider: ImageGenerationProvider | null = null;
function getImageProvider(): ImageGenerationProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = isE2EControlledProviderEnabled()
    ? E2EControlledImageProvider.forLocalRuntime()
    : new OpenAIImageProvider();
  return cachedProvider;
}

export function __setImageProviderForTests(provider: ImageGenerationProvider | null) {
  cachedProvider = provider;
}

export function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { retryable?: unknown; status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; stack?: unknown; cause?: unknown; constructor?: { name?: unknown } };
  if (value.retryable === true) return true;
  const status = typeof value.status === "number" ? value.status : value.statusCode;
  if (typeof status === "number" && (status === 408 || status === 409 || status === 429 || status >= 500)) return true;
  if (["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ECONNREFUSED"].includes(String(value.code))) return true;
  const names = [value.name, value.constructor?.name].filter((name): name is string => typeof name === "string");
  if (names.some((name) => name === "AbortError" || name === "TimeoutError" || /^API[A-Za-z]*(Connection|Timeout|Abort)[A-Za-z]*Error$/.test(name))) return true;
  const stackName = typeof value.stack === "string"
    ? value.stack.split("\n", 1)[0]?.split(":", 1)[0]
    : null;
  if (stackName === "AbortError" || stackName === "TimeoutError" || (stackName && /^API[A-Za-z]*(Connection|Timeout|Abort)[A-Za-z]*Error$/.test(stackName))) return true;
  return value.cause !== error && isRetryableProviderError(value.cause);
}

export async function normalizeGeneratedImage(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  generationMode: GenerationMode
) {
  void generationMode;
  return sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "cover",
      position: "attention",
    })
    .png()
    .toBuffer();
}

async function uploadAndReleaseCandidate(
  routeId: string,
  candidate: ImageCandidate,
  outputPrefix: string,
  outputSuffix: string
): Promise<StoredCandidate> {
  const outputKey = `${outputPrefix}/candidates/${routeId}${outputSuffix}.png`;
  const bytes = candidate.buffer.byteLength;
  await objectStorage.put(outputKey, candidate.buffer, candidate.mimeType);
  let imageUrl: string | undefined;
  try {
    imageUrl = await objectStorage.signedDownloadUrl(outputKey);
  } catch (error) {
    logger.warn("[generateAndStoreImage] signed URL unavailable; keeping buffer for selector", {
      routeId,
      message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    });
  }

  return {
    routeId,
    outputKey,
    mimeType: candidate.mimeType,
    providerMeta: candidate.providerMeta,
    imageUrl,
    buffer: imageUrl ? undefined : candidate.buffer,
    bytes,
  };
}

/**
 * Generate each route under the concurrency limiter, uploading immediately and
 * releasing the provider buffer before the next route starts when possible.
 */
async function generateUploadRoutesRound(
  provider: ImageGenerationProvider,
  requestedRoutes: Array<{ id: string; prompt: string }>,
  base: {
    dimensions: { width: number; height: number };
    referenceImages: ImageReference[];
    generationMode: GenerationMode;
    outputPrefix: string;
    attempt: number;
    quality: "medium" | "high";
    useMediumForRoutes: boolean;
    outputSuffix: string;
    onStageHeartbeat?: (stage: string) => Promise<void>;
    maxCalls: number;
  }
): Promise<{ results: PromiseSettledResult<StoredCandidate>[]; callsMade: number }> {
  const limit = pLimit({
    concurrency: getImageRouteConcurrency(),
    rejectOnClear: true,
  });
  const routesToRun = requestedRoutes.slice(0, Math.max(0, base.maxCalls));
  const skipped = requestedRoutes.slice(routesToRun.length);
  const abort = { reason: null as Error | null };

  const isAbortSignal = (error: unknown) => {
    if (!error || typeof error !== "object") return false;
    const value = error as { code?: unknown; name?: unknown; message?: unknown };
    return (
      value.code === "lease_lost" ||
      value.name === "AbortError" ||
      (typeof value.message === "string" && value.message.startsWith("creative_work_lease_lost:"))
    );
  };

  const markAborted = (error: unknown) => {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "route_generation_aborted");
    if (!abort.reason) {
      abort.reason = err;
      limit.clearQueue();
    }
  };

  const assertNotAborted = () => {
    if (abort.reason) throw abort.reason;
  };

  let indexed: Array<{ index: number; result: PromiseSettledResult<StoredCandidate> }>;
  try {
    indexed = await Promise.all(
      routesToRun.map((route, index) =>
        limit(async () => {
          assertNotAborted();
          const providerInput: ProviderGenerateInput = {
            prompt: route.prompt,
            dimensions: base.dimensions,
            referenceImages: base.referenceImages,
            generationMode: base.generationMode,
            outputPrefix: base.outputPrefix,
            attempt: base.attempt,
            quality: base.useMediumForRoutes ? "medium" : base.quality,
          };
          try {
            assertNotAborted();
            const candidate = await provider.generate(providerInput);
            assertNotAborted();
            const stored = await uploadAndReleaseCandidate(
              route.id,
              candidate,
              base.outputPrefix,
              base.outputSuffix
            );
            return { index, result: { status: "fulfilled" as const, value: stored } };
          } catch (reason) {
            if (isAbortSignal(reason)) {
              markAborted(reason);
              throw reason;
            }
            return { index, result: { status: "rejected" as const, reason } };
          } finally {
            // Renew the processing lease after every attempt — including failures —
            // so serial timeouts cannot outrun the 10-minute stale window.
            try {
              await base.onStageHeartbeat?.(`candidate_attempt:${route.id}`);
            } catch (heartbeatError) {
              if (isAbortSignal(heartbeatError)) {
                markAborted(heartbeatError);
                throw heartbeatError;
              }
              logger.warn("[generateAndStoreImage] heartbeat failed after candidate attempt", {
                routeId: route.id,
                message:
                  heartbeatError instanceof Error
                    ? heartbeatError.message.slice(0, 500)
                    : String(heartbeatError).slice(0, 500),
              });
            }
          }
        })
      )
    );
  } catch (error) {
    if (isAbortSignal(error) || abort.reason) {
      throw abort.reason ?? error;
    }
    throw error;
  }

  const results = indexed
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.result);

  for (const route of skipped) {
    results.push({
      status: "rejected",
      reason: new Error(`Provider call budget exhausted before route ${route.id}`),
    });
  }

  // Only count routes that actually started provider work (not cleared from queue).
  const callsMade = results.filter((result) => {
    if (result.status === "fulfilled") return true;
    const reason = result.reason;
    if (isAbortSignal(reason)) return false;
    if (reason instanceof Error && reason.message.startsWith("Provider call budget exhausted")) {
      return false;
    }
    return true;
  }).length;

  return { results, callsMade };
}

async function loadCandidateBuffer(candidate: StoredCandidate): Promise<Buffer> {
  if (candidate.buffer) return candidate.buffer;
  const loaded = await objectStorage.get(candidate.outputKey);
  return Buffer.isBuffer(loaded) ? loaded : Buffer.from(loaded as ArrayBuffer);
}

export async function generateAndStoreImage(
  input: GenerateAndStoreImageInput
): Promise<GenerateAndStoreImageResult> {
  const {
    prompt,
    dimensions,
    outputPrefix,
    referenceImages,
    attempt = 0,
    generationMode = "art_variation",
    quality = "high",
    routes,
    selectCandidate,
    outputSuffix = "",
    telemetry,
    onStageHeartbeat,
    callBudget,
  } = input;

  const budget = callBudget ?? { remaining: DEFAULT_IMAGE_PROVIDER_CALL_BUDGET };
  const provider = getImageProvider();
  const requestedRoutes = routes?.length
    ? routes
    : [{ id: "openai", prompt }];
  const pipelineTimer = createPipelineTimer();
  const generationTimer = createPipelineTimer();
  let providerCalls = 0;
  let providerRetries = 0;
  const correlation = {
    workId: telemetry?.workId,
    outputId: telemetry?.outputId,
    workspaceId: telemetry?.workspaceId,
    inngestRunId: telemetry?.inngestRunId,
    inngestAttempt: telemetry?.inngestAttempt,
    jobType: telemetry?.jobType ?? "derivation",
  };

  logImagePipelineStage({
    event: "image_pipeline_stage",
    stage: "candidate_generation",
    status: "started",
    ...correlation,
    inputCount: referenceImages.length,
    inputBytes: referenceImages.reduce((sum, ref) => sum + ref.buffer.byteLength, 0),
  });

  const roundInput = {
    dimensions,
    referenceImages,
    generationMode,
    outputPrefix,
    attempt,
    quality,
    useMediumForRoutes: Boolean(routes?.length),
    outputSuffix,
    onStageHeartbeat,
  };

  const firstRound = await generateUploadRoutesRound(provider, requestedRoutes, {
    ...roundInput,
    maxCalls: budget.remaining,
  });
  let generationResults = firstRound.results;
  providerCalls += firstRound.callsMade;
  budget.remaining = Math.max(0, budget.remaining - firstRound.callsMade);

  let candidates = generationResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((result): result is StoredCandidate => result !== null);

  if (candidates.length === 0 && budget.remaining > 0) {
    providerRetries = 1;
    logImagePipelineStage({
      stage: "candidate_generation_retry",
      status: "started",
      ...correlation,
      providerCalls,
      providerRetries,
    });
    const secondRound = await generateUploadRoutesRound(provider, requestedRoutes, {
      ...roundInput,
      attempt: attempt + 1,
      maxCalls: budget.remaining,
    });
    generationResults = secondRound.results;
    providerCalls += secondRound.callsMade;
    budget.remaining = Math.max(0, budget.remaining - secondRound.callsMade);
    candidates = generationResults
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((result): result is StoredCandidate => result !== null);
  }

  if (candidates.length === 0) {
    const failures = generationResults.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    const reason = failures.map(String).filter(Boolean).join("; ");
    const aggregate = new Error(`All image candidates failed: ${reason}`) as Error & { retryable?: boolean; code?: string };
    aggregate.retryable = false;
    logImagePipelineStage({
      stage: "candidate_generation",
      status: "failed",
      ...correlation,
      stageElapsedMs: generationTimer.elapsedMs(),
      providerCalls,
      providerRetries,
      errorMessage: aggregate.message,
    });
    throw aggregate;
  }

  const generationElapsedMs = generationTimer.elapsedMs();
  logImagePipelineStage({
    stage: "candidate_generation",
    status: "completed",
    ...correlation,
    stageElapsedMs: generationElapsedMs,
    providerCalls,
    providerRetries,
    outputBytes: candidates.reduce((sum, c) => sum + c.bytes, 0),
  });

  const selectionTimer = createPipelineTimer();
  await onStageHeartbeat?.("selection_started");
  const selection = selectCandidate
    ? await selectCandidate(candidates.map(({ routeId, outputKey, buffer, mimeType, imageUrl }) => ({
        routeId,
        outputKey,
        buffer,
        mimeType,
        imageUrl,
      })))
    : 0;
  let winnerIndex = typeof selection === "number" ? selection : selection.winnerIndex;
  let selectionReason = typeof selection === "number" ? undefined : selection.reason;
  if (!Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= candidates.length) {
    throw new Error(`Candidate selector returned invalid index ${winnerIndex}`);
  }
  await onStageHeartbeat?.("selection_completed");

  logImagePipelineStage({
    stage: "selection",
    status: "completed",
    ...correlation,
    stageElapsedMs: selectionTimer.elapsedMs(),
    providerCalls,
    providerRetries,
  });

  const winner = candidates[winnerIndex];
  const winnerBuffer = await loadCandidateBuffer(winner);
  for (const candidate of candidates) {
    if (candidate !== winner) candidate.buffer = undefined;
  }

  const normalizedWinner = await normalizeGeneratedImage(
    winnerBuffer,
    dimensions,
    generationMode
  );
  await onStageHeartbeat?.("composition_completed");

  const finalKey = `${outputPrefix}/${Date.now()}${outputSuffix}.png`;
  await objectStorage.put(finalKey, normalizedWinner, "image/png");
  await onStageHeartbeat?.("final_upload_completed");

  const candidateMeta: (GenerationCandidateMeta & { winner: boolean })[] =
    candidates.map((c, idx) => ({
      provider: c.providerMeta.provider,
      routeId: c.routeId,
      model: c.providerMeta.model,
      outputKey: c.outputKey,
      durationMs: c.providerMeta.durationMs,
      costCredits: c.providerMeta.costCredits,
      rawRequestId: c.providerMeta.rawRequestId,
      revisedPrompt: c.providerMeta.revisedPrompt,
      selectionReason: idx === winnerIndex ? selectionReason : undefined,
      winner: idx === winnerIndex,
    }));

  logger.info(
    `[generateAndStoreImage] produced ${candidates.length} candidate(s); winner=${winner.providerMeta.provider} rssMb=${Math.round(process.memoryUsage().rss / 1048576)}`
  );

  await recordDualEngineCandidates({
    campaignId: telemetry?.campaignId ?? "",
    derivationId: telemetry?.derivationId ?? outputPrefix,
    workspaceId: telemetry?.workspaceId ?? "",
    jobType:
      telemetry?.jobType === "creative_work" || telemetry?.jobType === "brand_training"
        ? telemetry.jobType
        : "derivation",
    candidates: candidateMeta.map((c) => ({
      provider: c.provider,
      model: c.model,
      outputKey: c.outputKey,
      durationMs: c.durationMs,
      costCredits: c.costCredits,
      rawRequestId: c.rawRequestId,
    })),
    winnerProvider: winner.providerMeta.provider,
    aggregateLatencyMs: generationElapsedMs,
  });

  logImagePipelineStage({
    stage: "finalize",
    status: "completed",
    ...correlation,
    stageElapsedMs: pipelineTimer.elapsedMs(),
    pipelineElapsedMs: pipelineTimer.elapsedMs(),
    providerCalls,
    providerRetries,
    outputBytes: normalizedWinner.byteLength,
  });

  return {
    outputKey: finalKey,
    revisedPrompt: winner.providerMeta.revisedPrompt ?? "",
    imageOperation: referenceImages.length > 0 ? "edit" : "generate",
    buffer: normalizedWinner,
    candidates: candidateMeta,
    providerCalls,
    providerRetries,
  };
}
