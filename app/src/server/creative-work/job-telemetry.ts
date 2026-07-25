import "server-only";
import { logger } from "@/lib/logger";

/**
 * R-007 / spec 12 — structured telemetry for the Creative Work output job.
 *
 * Every entry correlates workspaceId, workItemId, outputId, protocol,
 * run/attempt, stage, duration, RSS, image calls, retry, verdict and refund
 * so a single output can be traced across the claim → generate → QA →
 * correction → complete/fail lifecycle, including late-completion discards
 * and lease losses.
 */

export interface CreativeWorkOutputTelemetryBase {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Canonical protocol mode for v1 outputs; "legacy" for legacy-frozen works. */
  protocol: string;
  /** Inngest run id when the runtime provides it. */
  inngestRunId?: string;
  /** Inngest function attempt when the runtime provides it. */
  inngestAttempt?: number;
  /** Durable provider-call authority (image_call_count) at the moment of the event. */
  imageCallCount?: number;
  /** Requeue/command counter (retry_count) — never a provider-call authority. */
  retryCount?: number;
}

export interface CreativeWorkOutputStageTelemetry extends CreativeWorkOutputTelemetryBase {
  stage: string;
  status: "started" | "completed" | "failed";
  /** Milliseconds spent in this stage when measured. */
  stageDurationMs?: number;
  /** Objective verdict persisted by the QA stage. */
  verdict?: string | null;
  /** Whether a compensatory refund was applied in this stage. */
  refunded?: boolean;
  detail?: string;
}

export interface CreativeWorkOutputTerminalTelemetry extends CreativeWorkOutputTelemetryBase {
  outcome: "completed" | "failed" | "skipped" | "late_completion_discarded" | "lease_lost";
  failureCode?: string;
  verdict?: string | null;
  refunded: boolean;
  /** Total wall-clock duration of this job execution. */
  durationMs: number;
}

export function creativeWorkMemorySnapshotMb(): {
  rssMb: number;
  heapUsedMb: number;
  externalMb: number;
} {
  const usage = process.memoryUsage();
  const toMb = (bytes: number) => Math.round(bytes / (1024 * 1024));
  return {
    rssMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    externalMb: toMb(usage.external),
  };
}

/** Wall-clock timer for stage/total durations (performance.now based). */
export function createCreativeWorkJobTimer(): { elapsedMs: () => number } {
  const started = performance.now();
  return { elapsedMs: () => Math.round(performance.now() - started) };
}

export function logCreativeWorkOutputStage(fields: CreativeWorkOutputStageTelemetry): void {
  logger.info({
    event: "creative_work_output_stage",
    ...fields,
    ...creativeWorkMemorySnapshotMb(),
  });
}

export function logCreativeWorkOutputTerminal(fields: CreativeWorkOutputTerminalTelemetry): void {
  const payload = {
    event: "creative_work_output_terminal",
    ...fields,
    ...creativeWorkMemorySnapshotMb(),
  };
  // Failures and lease losses are operational anomalies — never info noise.
  if (fields.outcome === "failed") {
    logger.error(payload);
  } else if (fields.outcome === "lease_lost") {
    logger.warn(payload);
  } else {
    logger.info(payload);
  }
}

/**
 * A completion that lost the CAS race — the row left `processing` before the
 * commit landed (lease stolen, stale sweep, duplicate delivery). The late
 * result is discarded: status and ledger stay untouched (R-006/R-007).
 */
export function logCreativeWorkLateCompletionDiscarded(
  fields: CreativeWorkOutputTelemetryBase & { outputKey?: string },
): void {
  logger.warn({
    event: "late_completion_discarded",
    jobType: "creative_work",
    ...fields,
    ...creativeWorkMemorySnapshotMb(),
  });
}
