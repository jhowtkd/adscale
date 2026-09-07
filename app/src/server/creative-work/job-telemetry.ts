import "server-only";
import { logger } from "@/lib/logger";
import { heavyImageExecutorIdentity } from "@/server/jobs/heavy-image-isolation";
import type { BriefingReadiness } from "./contracts";

function truncateTelemetryMessage(value: unknown, max = 500): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

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
  generationCorrelationId?: string;
  /** Canonical protocol mode for v1 outputs; "legacy" for legacy-frozen works. */
  protocol: string;
  /** Inngest run id when the runtime provides it. */
  inngestRunId?: string;
  /** Inngest function attempt when the runtime provides it. */
  inngestAttempt?: number;
  /** Durable provider-call authority (image_call_count) at the moment of the event. */
  imageCallCount?: number;
  /** Provider calls made by the executor; distinct from the durable budget claim. */
  providerCalls?: number;
  providerRetries?: number;
  /** Requeue/command counter (retry_count) — never a provider-call authority. */
  retryCount?: number;
  /** Durable generation width and the processing units observed for this run. */
  unitCount?: number;
  activeUnitCount?: number;
  environment?: string;
}

/**
 * Task 10 — safe carousel deck correlation fields (operational telemetry
 * only; the funnel events themselves stay in beta-analytics). Counts, kinds
 * and deck states ONLY: copy, prompts, answers, fact values, storage keys
 * and reference names must never enter these fields.
 */
export interface CarouselDeckTelemetryFields {
  /** Planned (or current) deck slide count. */
  slideCount?: number;
  /** Operator input kind: short_idea | long_text | pre_split. */
  inputKind?: string;
  /** Blocking questions the planner asked before the deck froze. */
  blockingQuestionCount?: number;
  /** Anchor-chain state: cover | middle | closing | remaining | complete. */
  anchorState?: string;
  /** Current failed slide count of the deck. */
  failedSlideCount?: number;
  /** Manual retry commands issued for this deck. */
  manualRetryCount?: number;
  /** Deck revisions observed (reorder/global-direction revisions). */
  deckRevisionCount?: number;
}

export interface CreativeWorkOutputStageTelemetry
  extends CreativeWorkOutputTelemetryBase,
    Partial<CarouselDeckTelemetryFields> {
  stage: string;
  status: "started" | "completed" | "failed";
  result?: "success" | "failed" | "skipped";
  /** Milliseconds spent in this stage when measured. */
  stageDurationMs?: number;
  /** Objective verdict persisted by the QA stage. */
  verdict?: string | null;
  /** Whether a compensatory refund was applied in this stage. */
  refunded?: boolean;
  detail?: string;
  queueEnteredAt?: string;
  processingStartedAt?: string;
  leaseStage?: string;
}

export interface CreativeWorkOutputTerminalTelemetry
  extends CreativeWorkOutputTelemetryBase,
    Partial<CarouselDeckTelemetryFields> {
  outcome: "completed" | "failed" | "canceled" | "skipped" | "late_completion_discarded" | "lease_lost";
  failureCode?: string;
  verdict?: string | null;
  refunded: boolean;
  /** Total wall-clock duration of this job execution. */
  durationMs: number;
  leaseStage?: string;
}

export type CreativeWorkGenerationLifecycleEvent =
  | "creative_work_generation_requested"
  | "creative_work_generation_accepted"
  | "creative_work_generation_dispatched";

/**
 * Safe pre-generation telemetry: keep the decision auditable without logging
 * the operator's request, inferred values, or factual source contents.
 */
export function logCreativeWorkBriefingCheck(fields: {
  workspaceId: string;
  workItemId: string;
  generationCorrelationId?: string;
  version: number;
  readiness: BriefingReadiness;
  code: "ok" | "missing_direction";
  automaticRevisionCount?: number;
  reviewResult?: "not_needed" | "passed" | "blocked" | "failed";
}): void {
  try {
    logger.info({ event: "creative_work_briefing_check", jobType: "creative_work", ...fields });
  } catch (error) {
    try {
      logger.warn({
        event: "creative_work_telemetry_emit_failed",
        sourceEvent: "creative_work_briefing_check",
        jobType: "creative_work",
        ...fields,
        errorMessage: truncateTelemetryMessage(error),
      });
    } catch {
      // Observability never changes preparation or charging behavior.
    }
  }
}

export function logCreativeWorkGenerationLifecycle(fields: {
  event: CreativeWorkGenerationLifecycleEvent;
  workspaceId: string;
  workItemId: string;
  generationCorrelationId?: string;
  unitCount: number;
  outputIds?: string[];
  credits?: number;
  unitChargeAmount?: number;
  dispatchDurationMs?: number;
  result?: "accepted" | "sent" | "failed" | "recovered";
  errorMessage?: string;
} & Partial<CarouselDeckTelemetryFields>): void {
  const { event, ...rest } = fields;
  const safeFields = rest.errorMessage
    ? { ...rest, errorMessage: truncateTelemetryMessage(rest.errorMessage) }
    : rest;
  try {
    logger.info({ event, jobType: "creative_work", ...heavyImageExecutorIdentity(), ...safeFields });
  } catch (error) {
    try {
      logger.warn({
        event: "creative_work_telemetry_emit_failed",
        sourceEvent: event,
        jobType: "creative_work",
        ...safeFields,
        errorMessage: truncateTelemetryMessage(error),
      });
    } catch {
      // Observability never changes charging or dispatch behavior.
    }
  }
}

export function logCreativeWorkGenerationAggregate(fields: {
  phase: "first_terminal" | "completed";
  workspaceId: string;
  workItemId: string;
  generationCorrelationId: string;
  unitCount: number;
  terminalCount: number;
  successCount: number;
  failureCount: number;
  result: "partial" | "completed" | "failed";
  firstTerminalAt: string;
  completedAt?: string;
  timeToFirstOutputMs: number;
  totalDurationMs?: number;
}): void {
  try {
    logger.info({ event: "creative_work_generation_aggregate", jobType: "creative_work", ...heavyImageExecutorIdentity(), ...fields });
  } catch (error) {
    try {
      logger.warn({
        event: "creative_work_telemetry_emit_failed",
        sourceEvent: "creative_work_generation_aggregate",
        ...fields,
        errorMessage: truncateTelemetryMessage(error),
      });
    } catch {
      // Aggregation telemetry never changes output state or settlement.
    }
  }
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

export function creativeWorkQueueWaitMs(input: {
  queueEnteredAt: Date;
  processingStartedAt: Date;
}): number {
  return Math.max(0, input.processingStartedAt.getTime() - input.queueEnteredAt.getTime());
}

/** Wall-clock timer for stage/total durations (performance.now based). */
export function createCreativeWorkJobTimer(): { elapsedMs: () => number } {
  const started = performance.now();
  return { elapsedMs: () => Math.round(performance.now() - started) };
}

export function logCreativeWorkOutputStage(fields: CreativeWorkOutputStageTelemetry): void {
  try {
    logger.info({
      event: "creative_work_output_stage",
      ...heavyImageExecutorIdentity(),
      ...fields,
      ...(fields.detail ? { detail: truncateTelemetryMessage(fields.detail) } : {}),
      ...creativeWorkMemorySnapshotMb(),
    });
  } catch (error) {
    try {
      logger.warn({
        event: "creative_work_telemetry_emit_failed",
        sourceEvent: "creative_work_output_stage",
        ...fields,
        ...(fields.detail ? { detail: truncateTelemetryMessage(fields.detail) } : {}),
        errorMessage: truncateTelemetryMessage(error),
      });
    } catch {
      // Observability never changes generation behavior.
    }
  }
}

export async function observeCreativeWorkStage<T>(
  fields: CreativeWorkOutputTelemetryBase,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  logCreativeWorkOutputStage({ ...fields, stage, status: "started" });
  try {
    const result = await operation();
    logCreativeWorkOutputStage({
      ...fields,
      stage,
      status: "completed",
      result: "success",
      stageDurationMs: Math.round(performance.now() - started),
    });
    return result;
  } catch (error) {
    logCreativeWorkOutputStage({
      ...fields,
      stage,
      status: "failed",
      result: "failed",
      stageDurationMs: Math.round(performance.now() - started),
      detail: truncateTelemetryMessage(error),
    });
    throw error;
  }
}

export function logCreativeWorkOutputTerminal(fields: CreativeWorkOutputTerminalTelemetry): void {
  try {
    const payload = {
      event: "creative_work_output_terminal",
      ...heavyImageExecutorIdentity(),
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
  } catch (error) {
    try {
      logger.warn({
        event: "creative_work_telemetry_emit_failed",
        sourceEvent: "creative_work_output_terminal",
        ...fields,
        errorMessage: truncateTelemetryMessage(error),
      });
    } catch {
      // Terminal telemetry cannot alter the terminal result or settlement.
    }
  }
}

export function logCreativeWorkRetry(fields: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  generationCorrelationId?: string;
  action: "auto_retry" | "manual_retry" | "requeue";
  reason: string;
  retryCount: number;
  imageCallCount: number;
  leaseStage?: string;
}): void {
  try {
    logger.info({ event: "creative_work_output_retry", jobType: "creative_work", ...fields });
  } catch (error) {
    try {
      logger.warn({
        event: "creative_work_telemetry_emit_failed",
        sourceEvent: "creative_work_output_retry",
        ...fields,
        errorMessage: truncateTelemetryMessage(error),
      });
    } catch {
      // Observability never changes retry or billing behavior.
    }
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
  try {
    logger.warn({
      event: "late_completion_discarded",
      jobType: "creative_work",
      ...fields,
      ...creativeWorkMemorySnapshotMb(),
    });
  } catch {
    // The late result is already discarded; a sink failure must stay auxiliary.
  }
}
