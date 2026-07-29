import { logger } from "@/lib/logger";

export type ImagePipelineStageStatus = "started" | "completed" | "failed";

export type ImagePipelineStageFields = {
  inngestRunId?: string;
  inngestAttempt?: number;
  workId?: string;
  outputId?: string;
  workspaceId?: string;
  jobType?: string;
  stage: string;
  status: ImagePipelineStageStatus;
  stageElapsedMs?: number;
  pipelineElapsedMs?: number;
  providerCalls?: number;
  providerRetries?: number;
  inputCount?: number;
  inputBytes?: number;
  outputBytes?: number;
  replay_possible?: boolean;
  errorMessage?: string;
  [key: string]: unknown;
};

export type ImagePipelineExternalCallType = "planner" | "image" | "selector" | "qa" | "score";

export type ImagePipelineExternalCallFields = {
  callType: ImagePipelineExternalCallType;
  attempt: number;
  workspaceId?: string;
  workId?: string;
  outputId?: string;
  generationCorrelationId?: string;
  /** Durable Creative Work claim count at the time of an image call. */
  imageCallCount?: number;
  jobType?: string;
  callIndex?: number;
};

function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round(usage.rss / (1024 * 1024)),
    heapUsedMb: Math.round(usage.heapUsed / (1024 * 1024)),
    externalMb: Math.round(usage.external / (1024 * 1024)),
  };
}

function truncateMessage(value: unknown, max = 500): string | undefined {
  if (value == null) return undefined;
  const text = value instanceof Error ? value.message : String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function logExternalCall(fields: ImagePipelineExternalCallFields & {
  durationMs: number;
  result: "success" | "failed";
  errorMessage?: string;
}): void {
  try {
    logger.info({ event: "image_pipeline_external_call", ...fields });
  } catch (error) {
    try {
      logger.warn({
        event: "image_pipeline_telemetry_emit_failed",
        sourceEvent: "image_pipeline_external_call",
        ...fields,
        errorMessage: truncateMessage(error) ?? "Unknown telemetry sink failure",
      });
    } catch {
      // Observability must never change provider or generation behavior.
    }
  }
}

export async function observeImagePipelineExternalCall<T>(
  fields: ImagePipelineExternalCallFields,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await operation();
    logExternalCall({
      ...fields,
      durationMs: Math.round(performance.now() - started),
      result: "success",
    });
    return result;
  } catch (error) {
    logExternalCall({
      ...fields,
      durationMs: Math.round(performance.now() - started),
      result: "failed",
      errorMessage: truncateMessage(error),
    });
    throw error;
  }
}

export function logImagePipelineStage(fields: ImagePipelineStageFields): void {
  const { errorMessage, ...rest } = fields;
  const payload = {
    event: "image_pipeline_stage",
    ...rest,
    ...memorySnapshot(),
    ...(errorMessage ? { errorMessage: truncateMessage(errorMessage) } : {}),
  };
  try {
    logger.info(payload);
  } catch (error) {
    try {
      logger.warn({
        event: "image_pipeline_telemetry_emit_failed",
        sourceEvent: "image_pipeline_stage",
        inngestRunId: fields.inngestRunId,
        inngestAttempt: fields.inngestAttempt,
        workId: fields.workId,
        outputId: fields.outputId,
        workspaceId: fields.workspaceId,
        jobType: fields.jobType,
        stage: fields.stage,
        status: fields.status,
        errorMessage: truncateMessage(error) ?? "Unknown telemetry sink failure",
      });
    } catch {
      // Telemetry must never change the generation outcome.
    }
  }
}

export function createPipelineTimer() {
  const started = performance.now();
  return {
    elapsedMs: () => Math.round(performance.now() - started),
  };
}
