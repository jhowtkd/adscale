import { describe, it, expect } from "vitest";
import {
  computeAdditionalNeeded,
  buildCalibrationGuidance,
  buildImpactGuidance,
  buildQualityImprovementGuidance,
  normalizeSamplingStatus,
} from "@/server/human-quality/sampling/guidance";
import {
  SAMPLE_GLOBAL_MIN,
  SAMPLE_SLICE_MIN,
  SAMPLE_ARM_MIN,
} from "@/server/human-quality/sampling/thresholds";

describe("computeAdditionalNeeded", () => {
  it("returns gap when current is below required", () => {
    expect(computeAdditionalNeeded(2, 5)).toBe(3);
  });

  it("returns zero when current meets or exceeds required", () => {
    expect(computeAdditionalNeeded(5, 5)).toBe(0);
    expect(computeAdditionalNeeded(7, 5)).toBe(0);
  });
});

describe("normalizeSamplingStatus", () => {
  it("maps insufficient_corpus to insufficient_sample", () => {
    expect(normalizeSamplingStatus("insufficient_corpus")).toBe(
      "insufficient_sample"
    );
  });

  it("passes through ok and insufficient_sample unchanged", () => {
    expect(normalizeSamplingStatus("ok")).toBe("ok");
    expect(normalizeSamplingStatus("insufficient_sample")).toBe(
      "insufficient_sample"
    );
  });
});

describe("buildCalibrationGuidance", () => {
  it("returns global gap when count is below SAMPLE_GLOBAL_MIN", () => {
    const guidance = buildCalibrationGuidance(2);

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      gate: "calibration_global",
      currentCount: 2,
      requiredCount: SAMPLE_GLOBAL_MIN,
      additionalNeeded: 3,
      blockedClaim: "calibration visual divergence",
    });
  });

  it("returns empty array when corpus is sufficient", () => {
    expect(buildCalibrationGuidance(SAMPLE_GLOBAL_MIN)).toEqual([]);
    expect(buildCalibrationGuidance(SAMPLE_GLOBAL_MIN + 2)).toEqual([]);
  });
});

describe("buildImpactGuidance", () => {
  it("emits global gap when total rows below minimum", () => {
    const guidance = buildImpactGuidance({
      globalCount: 2,
      slices: [],
    });

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      gate: "impact_global",
      currentCount: 2,
      requiredCount: SAMPLE_GLOBAL_MIN,
      additionalNeeded: 3,
      blockedClaim: "learning impact movement delta",
    });
  });

  it("emits per-slice arm gaps when learned or nonLearned below SAMPLE_ARM_MIN", () => {
    const guidance = buildImpactGuidance({
      globalCount: SAMPLE_GLOBAL_MIN,
      slices: [
        {
          sliceKey: "client-1|art_variation|1:1",
          learnedCount: 1,
          nonLearnedCount: SAMPLE_ARM_MIN,
        },
        {
          sliceKey: "client-2|restyling|4:5",
          learnedCount: SAMPLE_ARM_MIN,
          nonLearnedCount: 0,
        },
      ],
    });

    expect(guidance).toHaveLength(2);

    const learnedGap = guidance.find(
      (item) =>
        item.sliceKey === "client-1|art_variation|1:1" && item.arm === "learned"
    );
    expect(learnedGap).toMatchObject({
      gate: "impact_slice_arm",
      currentCount: 1,
      requiredCount: SAMPLE_ARM_MIN,
      additionalNeeded: 2,
      blockedClaim: "learning impact movement delta",
    });

    const nonLearnedGap = guidance.find(
      (item) =>
        item.sliceKey === "client-2|restyling|4:5" && item.arm === "non_learned"
    );
    expect(nonLearnedGap).toMatchObject({
      gate: "impact_slice_arm",
      currentCount: 0,
      requiredCount: SAMPLE_ARM_MIN,
      additionalNeeded: SAMPLE_ARM_MIN,
    });
  });

  it("returns empty when global and all slice arms are sufficient", () => {
    const guidance = buildImpactGuidance({
      globalCount: SAMPLE_GLOBAL_MIN,
      slices: [
        {
          sliceKey: "client-1|art_variation|1:1",
          learnedCount: SAMPLE_ARM_MIN,
          nonLearnedCount: SAMPLE_ARM_MIN,
        },
      ],
    });

    expect(guidance).toEqual([]);
  });
});

describe("buildQualityImprovementGuidance", () => {
  it("emits per-reason before and after arm gaps", () => {
    const guidance = buildQualityImprovementGuidance([
      {
        reason: "visual_overload",
        beforeCount: 2,
        afterCount: 1,
      },
    ]);

    expect(guidance).toHaveLength(2);

    const beforeGap = guidance.find((item) => item.arm === "before");
    expect(beforeGap).toMatchObject({
      gate: "quality_improvement_reason",
      dimension: "visual_overload",
      currentCount: 2,
      requiredCount: SAMPLE_SLICE_MIN,
      additionalNeeded: 1,
      blockedClaim: "targeted failure-frequency improvement",
    });

    const afterGap = guidance.find((item) => item.arm === "after");
    expect(afterGap).toMatchObject({
      gate: "quality_improvement_reason",
      dimension: "visual_overload",
      currentCount: 1,
      requiredCount: SAMPLE_SLICE_MIN,
      additionalNeeded: 2,
    });
  });

  it("returns empty when all reason arms meet SAMPLE_SLICE_MIN", () => {
    const guidance = buildQualityImprovementGuidance([
      {
        reason: "weak_hierarchy",
        beforeCount: SAMPLE_SLICE_MIN,
        afterCount: SAMPLE_SLICE_MIN,
      },
    ]);

    expect(guidance).toEqual([]);
  });
});

describe("sampleGuidance shape", () => {
  it("every guidance item includes required numeric fields", () => {
    const items = [
      ...buildCalibrationGuidance(1),
      ...buildImpactGuidance({
        globalCount: 1,
        slices: [
          {
            sliceKey: "s|m|f",
            learnedCount: 0,
            nonLearnedCount: 0,
          },
        ],
      }),
      ...buildQualityImprovementGuidance([
        { reason: "illegible_cta", beforeCount: 0, afterCount: 0 },
      ]),
    ];

    for (const item of items) {
      expect(item).toHaveProperty("currentCount");
      expect(item).toHaveProperty("requiredCount");
      expect(item).toHaveProperty("additionalNeeded");
      expect(item).toHaveProperty("blockedClaim");
      expect(typeof item.blockedClaim).toBe("string");
      expect(item.blockedClaim.length).toBeGreaterThan(0);
    }
  });
});
