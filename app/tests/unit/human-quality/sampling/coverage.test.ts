import { describe, it, expect } from "vitest";
import { buildSampleCoverageReport } from "@/server/human-quality/sampling/coverage";
import type { SampleGuidance } from "@/server/human-quality/sampling/types";
import {
  SAMPLE_ARM_MIN,
  SAMPLE_GLOBAL_MIN,
  SAMPLE_SLICE_MIN,
} from "@/server/human-quality/sampling/thresholds";

const CAPTURED_AT = "2026-06-17T12:00:00.000Z";

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
});
