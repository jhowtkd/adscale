import { describe, expect, it } from "vitest";
import {
  assessCreativeWorkPerformance,
  buildCreativeWorkTechnicalMetricsEvidence,
  CREATIVE_WORK_BATCH_P95_BUDGET_MS,
  CREATIVE_WORK_OUTPUT_P95_BUDGET_MS,
  CREATIVE_WORK_RSS_BUDGET_MB,
  percentile95,
} from "@/server/creative-work/performance-evidence";

/**
 * R-007.6 / T12: deterministic proof that durations/RSS are measured,
 * aggregated and REJECTED when they exceed the rollout budgets, and that the
 * evidence fragment matches the Gate 8 checker shape. No paid provider, no
 * wall-clock dependency beyond controlled delays.
 */

function validSamples() {
  return {
    outputDurationsMs: [61_000, 72_000, 58_000, 66_000, 70_000],
    batchDurationsMs: [181_000, 190_000],
    rssPeakMb: [210, 224, 218],
    imageCallCounts: [1, 1, 2, 1, 1],
  };
}

describe("percentile95 (nearest-rank, deterministic)", () => {
  it("returns null for empty samples and the nearest rank otherwise", () => {
    expect(percentile95([])).toBeNull();
    expect(percentile95([100])).toBe(100);
    expect(percentile95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(100);
    expect(percentile95([100, 10, 90, 20, 80, 30, 70, 40, 60, 50])).toBe(100);
  });
});

describe("assessCreativeWorkPerformance", () => {
  it("accepts samples inside every budget simultaneously", () => {
    const assessment = assessCreativeWorkPerformance(validSamples());
    expect(assessment.withinBudget).toBe(true);
    expect(assessment.violations).toEqual([]);
    expect(assessment.maxImageCallCount).toBe(2);
    expect(assessment.p95OutputMs).toBe(72_000);
    expect(assessment.maxRssMb).toBe(224);
  });

  it("rejects an output p95 above the 4-minute budget", () => {
    const assessment = assessCreativeWorkPerformance({
      ...validSamples(),
      outputDurationsMs: [61_000, CREATIVE_WORK_OUTPUT_P95_BUDGET_MS + 1_000],
    });
    expect(assessment.withinBudget).toBe(false);
    expect(assessment.violations.join(" ")).toContain("p95 per output");
  });

  it("rejects a batch p95 above the 8-minute budget", () => {
    const assessment = assessCreativeWorkPerformance({
      ...validSamples(),
      batchDurationsMs: [CREATIVE_WORK_BATCH_P95_BUDGET_MS + 1_000],
    });
    expect(assessment.withinBudget).toBe(false);
    expect(assessment.violations.join(" ")).toContain("p95 per three-output batch");
  });

  it("rejects RSS at or above the ~358 MB budget", () => {
    const assessment = assessCreativeWorkPerformance({
      ...validSamples(),
      rssPeakMb: [CREATIVE_WORK_RSS_BUDGET_MB],
    });
    expect(assessment.withinBudget).toBe(false);
    expect(assessment.violations.join(" ")).toContain("RSS peak");
  });

  it("rejects any output above two durable image calls", () => {
    const assessment = assessCreativeWorkPerformance({
      ...validSamples(),
      imageCallCounts: [1, 3],
    });
    expect(assessment.withinBudget).toBe(false);
    expect(assessment.violations.join(" ")).toContain("image calls");
  });

  it("rejects broken measurements instead of approving them", () => {
    const assessment = assessCreativeWorkPerformance({
      outputDurationsMs: [Number.NaN],
      batchDurationsMs: [0],
      rssPeakMb: [-1],
      imageCallCounts: [],
    });
    expect(assessment.withinBudget).toBe(false);
    expect(assessment.p95OutputMs).toBeNull();
    expect(assessment.violations.length).toBeGreaterThanOrEqual(3);
  });

  it("measures controlled-delay work with the same plumbing (performance.now)", async () => {
    const measured: number[] = [];
    for (const delayMs of [5, 8, 6]) {
      const started = performance.now();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      measured.push(Math.round(performance.now() - started));
    }
    // Measured values are real (positive, finite) and aggregate cleanly —
    // the assertion is about the measurement path, not wall-clock precision.
    const assessment = assessCreativeWorkPerformance({
      outputDurationsMs: measured,
      batchDurationsMs: [measured.reduce((sum, value) => sum + value, 0)],
      rssPeakMb: [Math.round(process.memoryUsage().rss / (1024 * 1024)) || 1],
      imageCallCounts: [1, 1, 1],
    });
    expect(measured.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(assessment.violations.filter((violation) => violation.includes("non-positive"))).toEqual([]);
  });
});

describe("buildCreativeWorkTechnicalMetricsEvidence (Gate 8 fragment shape)", () => {
  it("emits the exact shape the checker validates, with zero refinement and per-output call counts", () => {
    const evidence = buildCreativeWorkTechnicalMetricsEvidence({
      samples: validSamples(),
      rssMeasurement: {
        process: "web",
        instanceType: "render-starter-512mb",
        method: "process.memoryUsage().rss per job terminal event",
      },
    });
    expect(evidence).toEqual({
      outputDurationsMs: validSamples().outputDurationsMs,
      batchDurationsMs: validSamples().batchDurationsMs,
      rssPeakMb: validSamples().rssPeakMb,
      rssMeasurement: {
        process: "web",
        instanceType: "render-starter-512mb",
        method: "process.memoryUsage().rss per job terminal event",
      },
      refinementCallCount: 0,
      imageCallCounts: validSamples().imageCallCounts,
    });
    // Input arrays are copied — later mutation never rewrites evidence.
    const samples = validSamples();
    const fragment = buildCreativeWorkTechnicalMetricsEvidence({
      samples,
      rssMeasurement: { process: "web", instanceType: "x", method: "y" },
    });
    samples.outputDurationsMs.push(999_999);
    expect(fragment.outputDurationsMs).not.toContain(999_999);
  });
});
