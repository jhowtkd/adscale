import { describe, it, expect } from "vitest";
import { buildSampleCoverageReport } from "@/server/human-quality/sampling/coverage";
import type { SampleGuidance } from "@/server/human-quality/sampling/types";
import {
  SAMPLE_ARM_MIN,
  SAMPLE_GLOBAL_MIN,
  SAMPLE_SLICE_MIN,
  TREND_GLOBAL_MIN_EVALUATED,
  TREND_MIN_TIME_BUCKETS,
} from "@/server/human-quality/sampling/thresholds";

const CAPTURED_AT = "2026-06-17T12:00:00.000Z";

function defaultTrendInput(overrides: Partial<{
  status: "ok" | "insufficient_sample";
  sampleGuidance: SampleGuidance[];
  evaluatedItemCount: number;
  populatedBucketCount: number;
}> = {}) {
  return {
    status: overrides.status ?? ("insufficient_sample" as const),
    sampleGuidance: overrides.sampleGuidance ?? [
      {
        gate: "trend_global" as const,
        currentCount: overrides.evaluatedItemCount ?? 0,
        requiredCount: TREND_GLOBAL_MIN_EVALUATED,
        additionalNeeded: TREND_GLOBAL_MIN_EVALUATED,
        blockedClaim: "quality trend direction",
      },
      {
        gate: "trend_time_buckets" as const,
        currentCount: overrides.populatedBucketCount ?? 0,
        requiredCount: TREND_MIN_TIME_BUCKETS,
        additionalNeeded: TREND_MIN_TIME_BUCKETS,
        blockedClaim: "quality trend direction",
      },
    ],
    evaluatedItemCount: overrides.evaluatedItemCount ?? 0,
    populatedBucketCount: overrides.populatedBucketCount ?? 0,
  };
}

function emptyReports() {
  return buildSampleCoverageReport({
    capturedAt: CAPTURED_AT,
    calibration: {
      status: "insufficient_corpus",
      evaluatedItemCount: 0,
      sampleGuidance: [
        {
          gate: "calibration_global",
          currentCount: 0,
          requiredCount: SAMPLE_GLOBAL_MIN,
          additionalNeeded: SAMPLE_GLOBAL_MIN,
          blockedClaim: "calibration visual divergence",
        },
      ],
    },
    impact: {
      status: "insufficient_sample",
      evaluatedItemCount: 0,
      sampleGuidance: [
        {
          gate: "impact_global",
          currentCount: 0,
          requiredCount: SAMPLE_GLOBAL_MIN,
          additionalNeeded: SAMPLE_GLOBAL_MIN,
          blockedClaim: "learning impact movement delta",
        },
      ],
    },
    quality: {
      status: "insufficient_sample",
      sampleGuidance: [
        {
          gate: "quality_improvement_reason",
          dimension: "visual_overload",
          arm: "after",
          currentCount: 0,
          requiredCount: SAMPLE_SLICE_MIN,
          additionalNeeded: SAMPLE_SLICE_MIN,
          blockedClaim: "targeted failure-frequency improvement",
        },
      ],
    },
    trend: defaultTrendInput(),
  });
}

describe("buildSampleCoverageReport", () => {
  it("empty corpus yields all global gates insufficient and actionable nextOperatorAction", () => {
    const report = emptyReports();

    expect(report.evaluatedItemCount).toBe(0);
    expect(report.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "calibration_global",
          status: "insufficient_sample",
        }),
        expect.objectContaining({
          id: "impact_global",
          status: "insufficient_sample",
        }),
        expect.objectContaining({
          id: "quality_improvement",
          status: "insufficient_sample",
        }),
      ])
    );
    expect(report.nextGate).toBe("calibration");
    expect(report.nextOperatorAction.toLowerCase()).toContain("evaluat");
    expect(report.sliceGaps.length).toBeGreaterThanOrEqual(3);
  });

  it("merges sampleGuidance from all reports into sliceGaps sorted by additionalNeeded desc", () => {
    const guidance: SampleGuidance[] = [
      {
        gate: "impact_slice_arm",
        sliceKey: "a|art_variation|1:1",
        arm: "learned",
        currentCount: 1,
        requiredCount: SAMPLE_ARM_MIN,
        additionalNeeded: 2,
        blockedClaim: "learning impact movement delta",
      },
      {
        gate: "calibration_global",
        currentCount: 2,
        requiredCount: SAMPLE_GLOBAL_MIN,
        additionalNeeded: 3,
        blockedClaim: "calibration visual divergence",
      },
      {
        gate: "quality_improvement_reason",
        dimension: "weak_hierarchy",
        arm: "before",
        currentCount: 0,
        requiredCount: SAMPLE_SLICE_MIN,
        additionalNeeded: 3,
        blockedClaim: "targeted failure-frequency improvement",
      },
    ];

    const report = buildSampleCoverageReport({
      capturedAt: CAPTURED_AT,
      calibration: {
        status: "insufficient_corpus",
        evaluatedItemCount: 2,
        sampleGuidance: [guidance[1]],
      },
      impact: {
        status: "insufficient_sample",
        evaluatedItemCount: 2,
        sampleGuidance: [guidance[0]],
      },
      quality: {
        status: "insufficient_sample",
        sampleGuidance: [guidance[2]],
      },
      trend: defaultTrendInput({ evaluatedItemCount: 2, populatedBucketCount: 1 }),
    });

    expect(report.sliceGaps).toHaveLength(3);
    expect(report.sliceGaps[0].additionalNeeded).toBe(3);
    expect(report.sliceGaps[1].additionalNeeded).toBe(3);
    expect(report.sliceGaps[2].additionalNeeded).toBe(2);
  });

  it("sets nextGate to impact when calibration ok but impact insufficient", () => {
    const report = buildSampleCoverageReport({
      capturedAt: CAPTURED_AT,
      calibration: {
        status: "ok",
        evaluatedItemCount: SAMPLE_GLOBAL_MIN,
        sampleGuidance: [],
      },
      impact: {
        status: "insufficient_sample",
        evaluatedItemCount: SAMPLE_GLOBAL_MIN,
        sampleGuidance: [
          {
            gate: "impact_slice_arm",
            sliceKey: "x|restyling|4:5",
            arm: "non_learned",
            currentCount: 1,
            requiredCount: SAMPLE_ARM_MIN,
            additionalNeeded: 2,
            blockedClaim: "learning impact movement delta",
          },
        ],
      },
      quality: {
        status: "insufficient_sample",
        sampleGuidance: [],
      },
      trend: defaultTrendInput({
        evaluatedItemCount: SAMPLE_GLOBAL_MIN,
        populatedBucketCount: 1,
      }),
    });

    expect(report.gates.find((g) => g.id === "calibration_global")?.status).toBe("ok");
    expect(report.gates.find((g) => g.id === "impact_global")?.status).toBe(
      "insufficient_sample"
    );
    expect(report.nextGate).toBe("impact");
  });

  it("sets nextGate to release when all gates ok", () => {
    const report = buildSampleCoverageReport({
      capturedAt: CAPTURED_AT,
      calibration: {
        status: "ok",
        evaluatedItemCount: 10,
        sampleGuidance: [],
      },
      impact: {
        status: "ok",
        evaluatedItemCount: 10,
        sampleGuidance: [],
      },
      quality: {
        status: "ok",
        sampleGuidance: [],
      },
      trend: defaultTrendInput({
        status: "ok",
        sampleGuidance: [],
        evaluatedItemCount: 10,
        populatedBucketCount: TREND_MIN_TIME_BUCKETS,
      }),
    });

    expect(report.nextGate).toBe("release");
    expect(report.sliceGaps).toEqual([]);
    expect(report.gates.find((g) => g.id === "quality_improvement")?.status).toBe("ok");
  });

  it("includes blockedClaims on gate entries from guidance", () => {
    const report = emptyReports();
    const calibrationGate = report.gates.find((g) => g.id === "calibration_global");

    expect(calibrationGate?.blockedClaims).toContain("calibration visual divergence");
  });

  it("uses real trend status for trend_global gate with empty blockedClaims when ok", () => {
    const report = buildSampleCoverageReport({
      capturedAt: CAPTURED_AT,
      calibration: {
        status: "ok",
        evaluatedItemCount: 10,
        sampleGuidance: [],
      },
      impact: { status: "ok", evaluatedItemCount: 10, sampleGuidance: [] },
      quality: { status: "ok", sampleGuidance: [] },
      trend: defaultTrendInput({
        status: "ok",
        sampleGuidance: [],
        evaluatedItemCount: 10,
        populatedBucketCount: TREND_MIN_TIME_BUCKETS,
      }),
    });

    const trendGate = report.gates.find((g) => g.id === "trend_global");
    expect(trendGate?.status).toBe("ok");
    expect(trendGate?.blockedClaims).toEqual([]);
  });

  it("surfaces time-bucket guidance on trend_global when only one populated week", () => {
    const report = buildSampleCoverageReport({
      capturedAt: CAPTURED_AT,
      calibration: {
        status: "ok",
        evaluatedItemCount: TREND_GLOBAL_MIN_EVALUATED,
        sampleGuidance: [],
      },
      impact: {
        status: "ok",
        evaluatedItemCount: TREND_GLOBAL_MIN_EVALUATED,
        sampleGuidance: [],
      },
      quality: { status: "ok", sampleGuidance: [] },
      trend: {
        status: "insufficient_sample",
        evaluatedItemCount: TREND_GLOBAL_MIN_EVALUATED,
        populatedBucketCount: 1,
        sampleGuidance: [
          {
            gate: "trend_time_buckets",
            currentCount: 1,
            requiredCount: TREND_MIN_TIME_BUCKETS,
            additionalNeeded: 1,
            blockedClaim: "quality trend direction",
          },
        ],
      },
    });

    const trendGate = report.gates.find((g) => g.id === "trend_global");
    expect(trendGate?.status).toBe("insufficient_sample");
    expect(trendGate?.blockedClaims).toContain("quality trend direction");
    expect(trendGate?.blockedClaims.join(" ")).not.toContain("Phase 136");
  });
});
