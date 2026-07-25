import "server-only";

/**
 * R-007 / spec 12.2 — performance measurement, aggregation and budget
 * rejection for the Creative Work quality-recovery rollout.
 *
 * Scope (per plan): instrumentation, measurement, aggregation and the JSON
 * evidence fragment consumable by the Gate 8 checker
 * (`scripts/check-creative-work-quality-recovery-gate.ts`). The real p95/RSS
 * limits are enforced by the R-011 rollout evidence — this module computes
 * them deterministically and flags violations so over-budget samples are
 * rejected as soon as they are aggregated.
 */

/** spec 12.2 blocking targets. */
export const CREATIVE_WORK_OUTPUT_P95_BUDGET_MS = 4 * 60 * 1000;
export const CREATIVE_WORK_BATCH_P95_BUDGET_MS = 8 * 60 * 1000;
export const CREATIVE_WORK_RSS_BUDGET_MB = 358;
export const CREATIVE_WORK_MAX_IMAGE_CALLS_PER_OUTPUT = 2;

export interface CreativeWorkPerformanceSamples {
  /** One wall-clock duration per planned output. */
  outputDurationsMs: number[];
  /** One wall-clock duration per three-output batch. */
  batchDurationsMs: number[];
  /** RSS peak samples (MB) collected during the measured window. */
  rssPeakMb: number[];
  /** Durable image-call counter per planned output (never above 2). */
  imageCallCounts: number[];
}

export interface CreativeWorkPerformanceAssessment {
  p95OutputMs: number | null;
  p95BatchMs: number | null;
  maxRssMb: number | null;
  maxImageCallCount: number;
  /** True only when every budget is respected simultaneously. */
  withinBudget: boolean;
  /** Human-readable budget violations (empty when withinBudget). */
  violations: string[];
}

/** Nearest-rank p95 — deterministic for the small rollout samples. */
export function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(sorted.length * 0.95));
  return sorted[Math.min(rank, sorted.length) - 1];
}

function isValidSample(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Aggregate the measured samples and reject budgets that are exceeded. A
 * sample array with invalid (non-positive/non-finite) entries is itself a
 * violation — evidence with broken measurements can never approve a budget.
 */
export function assessCreativeWorkPerformance(
  samples: CreativeWorkPerformanceSamples,
): CreativeWorkPerformanceAssessment {
  const violations: string[] = [];

  const invalidOutput = samples.outputDurationsMs.some((value) => !isValidSample(value));
  const invalidBatch = samples.batchDurationsMs.some((value) => !isValidSample(value));
  const invalidRss = samples.rssPeakMb.some((value) => !isValidSample(value));
  if (invalidOutput) violations.push("outputDurationsMs contains a non-positive or non-finite sample");
  if (invalidBatch) violations.push("batchDurationsMs contains a non-positive or non-finite sample");
  if (invalidRss) violations.push("rssPeakMb contains a non-positive or non-finite sample");

  const p95OutputMs = invalidOutput ? null : percentile95(samples.outputDurationsMs);
  const p95BatchMs = invalidBatch ? null : percentile95(samples.batchDurationsMs);
  const maxRssMb = invalidRss || samples.rssPeakMb.length === 0
    ? null
    : Math.max(...samples.rssPeakMb);
  const maxImageCallCount = samples.imageCallCounts.length === 0
    ? 0
    : Math.max(...samples.imageCallCounts);

  if (p95OutputMs !== null && p95OutputMs > CREATIVE_WORK_OUTPUT_P95_BUDGET_MS) {
    violations.push(
      `p95 per output is ${(p95OutputMs / 1000).toFixed(0)}s; the budget is ${CREATIVE_WORK_OUTPUT_P95_BUDGET_MS / 1000}s`,
    );
  }
  if (p95BatchMs !== null && p95BatchMs > CREATIVE_WORK_BATCH_P95_BUDGET_MS) {
    violations.push(
      `p95 per three-output batch is ${(p95BatchMs / 1000).toFixed(0)}s; the budget is ${CREATIVE_WORK_BATCH_P95_BUDGET_MS / 1000}s`,
    );
  }
  if (maxRssMb !== null && maxRssMb >= CREATIVE_WORK_RSS_BUDGET_MB) {
    violations.push(
      `RSS peak is ${maxRssMb} MB; it must stay below ~${CREATIVE_WORK_RSS_BUDGET_MB} MB`,
    );
  }
  if (maxImageCallCount > CREATIVE_WORK_MAX_IMAGE_CALLS_PER_OUTPUT) {
    violations.push(
      `an output consumed ${maxImageCallCount} image calls; the absolute ceiling is ${CREATIVE_WORK_MAX_IMAGE_CALLS_PER_OUTPUT}`,
    );
  }

  return {
    p95OutputMs,
    p95BatchMs,
    maxRssMb,
    maxImageCallCount,
    withinBudget: violations.length === 0,
    violations,
  };
}

export interface CreativeWorkRssMeasurement {
  /** Process that produced the samples (e.g. "web"). */
  process: string;
  /** Instance type the samples reflect (e.g. "render-starter-512mb"). */
  instanceType: string;
  /** Collection method (e.g. "process.memoryUsage().rss per job terminal event"). */
  method: string;
}

/**
 * Gate 8 evidence fragment (`technicalMetrics`) in the exact shape the
 * checker validates: durations per planned output/batch, RSS peak samples
 * with their measurement provenance, zero refinement calls and one durable
 * image-call count per planned output.
 */
export function buildCreativeWorkTechnicalMetricsEvidence(input: {
  samples: CreativeWorkPerformanceSamples;
  rssMeasurement: CreativeWorkRssMeasurement;
}): {
  outputDurationsMs: number[];
  batchDurationsMs: number[];
  rssPeakMb: number[];
  rssMeasurement: CreativeWorkRssMeasurement;
  refinementCallCount: 0;
  imageCallCounts: number[];
} {
  return {
    outputDurationsMs: [...input.samples.outputDurationsMs],
    batchDurationsMs: [...input.samples.batchDurationsMs],
    rssPeakMb: [...input.samples.rssPeakMb],
    rssMeasurement: { ...input.rssMeasurement },
    refinementCallCount: 0,
    imageCallCounts: [...input.samples.imageCallCounts],
  };
}
