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

export function logImagePipelineStage(fields: ImagePipelineStageFields): void {
  const { errorMessage, ...rest } = fields;
  logger.info({
    event: "image_pipeline_stage",
    ...rest,
    ...memorySnapshot(),
    ...(errorMessage ? { errorMessage: truncateMessage(errorMessage) } : {}),
  });
}

export function createPipelineTimer() {
  const started = performance.now();
  return {
    elapsedMs: () => Math.round(performance.now() - started),
  };
}
