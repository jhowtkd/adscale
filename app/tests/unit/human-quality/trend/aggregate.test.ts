import { describe, it, expect } from "vitest";
import {
  computeBucketMetrics,
  detectRegression,
  TREND_REGRESSION_VISUAL_DROP_THRESHOLD,
} from "@/server/human-quality/trend/aggregate";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import type { TrendBucket } from "@/server/human-quality/trend/types";
import { TREND_SLICE_MIN } from "@/server/human-quality/sampling/thresholds";

const recordedApplication = {
  schemaVersion: 1,
  applied: true,
  resolution: "recorded",
  traceId: "trace-1",
  recommendationId: "rec-1",
  primaryVariableKey: "cta",
  algorithmVersion: "1.0.0",
  safetyVersion: "1.0.0",
  learningsSource: "postgres",
} as const;

function makeRow(
  overrides: {
    id?: string;
    visualScore?: number;
    factualPass?: boolean;
    learningApplied?: boolean;
  } = {}
): EvaluatedCorpusRow {
  const id = overrides.id ?? "corpus-1";
  const qualitySnapshot =
    overrides.learningApplied === true
      ? { outputLearningApplication: recordedApplication }
      : null;

  return {
    item: {
      id,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      campaignId: "camp-1",
      derivationId: "deriv-1",
      generationMode: "art_variation",
      format: "1:1",
      cohort: "baseline",
      corpusVersion: 1,
      status: "evaluated",
      artifactRef: { derivationId: "deriv-1" },
      qualitySnapshot,
      selectedByUserId: "user-1",
      selectedAt: new Date("2026-06-01"),
      createdAt: new Date("2026-06-01"),
      updatedAt: new Date("2026-06-01"),
    },
    evaluation: {
      id: `eval-${id}`,
      workspaceId: "ws-1",
      corpusItemId: id,
      reviewerUserId: "reviewer-1",
      visualScore: overrides.visualScore ?? 70,
      factualPass: overrides.factualPass ?? true,
      intent: "approve",
      primaryFailureReason: "other",
      otherReasonText: null,
      notes: null,
      evaluatedAt: new Date("2026-06-02"),
      createdAt: new Date("2026-06-02"),
      updatedAt: new Date("2026-06-02"),
    },
  } as EvaluatedCorpusRow;
}

function makeBucket(
  bucketKey: string,
  overrides: Partial<TrendBucket> = {}
): TrendBucket {
  return {
    bucketKey,
    periodStart: "2026-06-09T00:00:00.000Z",
    periodEnd: "2026-06-15T23:59:59.999Z",
    count: 3,
    meanHumanVisualScore: 70,
    factualPassRate: 1,
    learningImpactStatus: "ok",
    evidenceRefs: null,
    ...overrides,
  };
}

describe("TREND_REGRESSION_VISUAL_DROP_THRESHOLD", () => {
  it("is 5 for testability", () => {
    expect(TREND_REGRESSION_VISUAL_DROP_THRESHOLD).toBe(5);
  });
});

describe("computeBucketMetrics", () => {
  it("returns null means when n=0", () => {
    const metrics = computeBucketMetrics("2026-W24", []);

    expect(metrics.count).toBe(0);
    expect(metrics.meanHumanVisualScore).toBeNull();
    expect(metrics.factualPassRate).toBeNull();
    expect(metrics.learningImpactStatus).toBe("insufficient_sample");
  });

  it("computes correct mean visual and factual pass rate for n=3", () => {
    const rows = [
      makeRow({ id: "a", visualScore: 60, factualPass: true }),
      makeRow({ id: "b", visualScore: 70, factualPass: false }),
      makeRow({ id: "c", visualScore: 80, factualPass: true }),
    ];

    const metrics = computeBucketMetrics("2026-W24", rows);

    expect(metrics.count).toBe(3);
    expect(metrics.meanHumanVisualScore).toBeCloseTo(70);
    expect(metrics.factualPassRate).toBeCloseTo(2 / 3);
  });

  it("sets learningImpactStatus ok only when both arms meet TREND_SLICE_MIN", () => {
    const sufficientRows = [
      ...Array.from({ length: TREND_SLICE_MIN }, (_, index) =>
        makeRow({
          id: `learned-${index}`,
          learningApplied: true,
        })
      ),
      ...Array.from({ length: TREND_SLICE_MIN }, (_, index) =>
        makeRow({
          id: `non-${index}`,
          learningApplied: false,
        })
      ),
    ];

    expect(computeBucketMetrics("2026-W24", sufficientRows).learningImpactStatus).toBe(
      "ok"
    );

    const insufficientRows = [
      ...Array.from({ length: TREND_SLICE_MIN }, (_, index) =>
        makeRow({
          id: `learned-${index}`,
          learningApplied: true,
        })
      ),
      makeRow({ id: "non-1", learningApplied: false }),
    ];

    expect(
      computeBucketMetrics("2026-W24", insufficientRows).learningImpactStatus
    ).toBe("insufficient_sample");
  });

  it("uses buildImpactRow for learning arm partition", () => {
    const rows = [
      makeRow({ id: "a", learningApplied: true }),
      makeRow({ id: "b", learningApplied: false }),
    ];

    const metrics = computeBucketMetrics("2026-W24", rows);
    expect(metrics.learningImpactStatus).toBe("insufficient_sample");
    expect(metrics.count).toBe(2);
  });

  it("skips malformed visual scores safely", () => {
    const row = makeRow({ visualScore: 80 });
    (row.evaluation as { visualScore: unknown }).visualScore = "bad";

    const metrics = computeBucketMetrics("2026-W24", [row]);
    expect(metrics.meanHumanVisualScore).toBeNull();
    expect(metrics.count).toBe(1);
  });
});

describe("detectRegression", () => {
  it("returns true when last two sufficient buckets drop visual mean by >= 5", () => {
    const buckets = [
      makeBucket("2026-W24", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 80,
      }),
      makeBucket("2026-W25", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 74,
      }),
    ];

    expect(detectRegression(buckets)).toBe(true);
  });

  it("returns false when drop is below threshold", () => {
    const buckets = [
      makeBucket("2026-W24", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 80,
      }),
      makeBucket("2026-W25", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 76,
      }),
    ];

    expect(detectRegression(buckets)).toBe(false);
  });

  it("returns false when either of the last two sufficient buckets is below TREND_SLICE_MIN", () => {
    const buckets = [
      makeBucket("2026-W24", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 80,
      }),
      makeBucket("2026-W25", {
        count: TREND_SLICE_MIN - 1,
        meanHumanVisualScore: 60,
      }),
      makeBucket("2026-W26", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 50,
      }),
    ];

    expect(detectRegression(buckets)).toBe(false);
  });

  it("ignores empty buckets when finding last two sufficient buckets", () => {
    const buckets = [
      makeBucket("2026-W23", { count: 0, meanHumanVisualScore: null }),
      makeBucket("2026-W24", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 85,
      }),
      makeBucket("2026-W25", { count: 1, meanHumanVisualScore: 90 }),
      makeBucket("2026-W26", {
        count: TREND_SLICE_MIN,
        meanHumanVisualScore: 75,
      }),
    ];

    expect(detectRegression(buckets)).toBe(true);
  });
});
