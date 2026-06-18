import {
  SAMPLE_ARM_MIN,
  SAMPLE_GLOBAL_MIN,
  SAMPLE_SLICE_MIN,
} from "./thresholds";
import type {
  CalibrationSamplingStatus,
  SampleGuidance,
  SamplingStatus,
} from "./types";

export function computeAdditionalNeeded(
  currentCount: number,
  requiredCount: number
): number {
  return Math.max(0, requiredCount - currentCount);
}

export function normalizeSamplingStatus(
  status: CalibrationSamplingStatus | SamplingStatus
): SamplingStatus {
  if (status === "insufficient_corpus") {
    return "insufficient_sample";
  }
  return status;
}

export function buildCalibrationGuidance(
  evaluatedItemCount: number
): SampleGuidance[] {
  if (evaluatedItemCount >= SAMPLE_GLOBAL_MIN) {
    return [];
  }

  return [
    {
      gate: "calibration_global",
      currentCount: evaluatedItemCount,
      requiredCount: SAMPLE_GLOBAL_MIN,
      additionalNeeded: computeAdditionalNeeded(
        evaluatedItemCount,
        SAMPLE_GLOBAL_MIN
      ),
      blockedClaim: "calibration visual divergence",
    },
  ];
}

export interface ImpactSliceArmCounts {
  sliceKey: string;
  learnedCount: number;
  nonLearnedCount: number;
}

export function buildImpactGuidance(input: {
  globalCount: number;
  slices: ImpactSliceArmCounts[];
}): SampleGuidance[] {
  const guidance: SampleGuidance[] = [];

  if (input.globalCount < SAMPLE_GLOBAL_MIN) {
    guidance.push({
      gate: "impact_global",
      currentCount: input.globalCount,
      requiredCount: SAMPLE_GLOBAL_MIN,
      additionalNeeded: computeAdditionalNeeded(
        input.globalCount,
        SAMPLE_GLOBAL_MIN
      ),
      blockedClaim: "learning impact movement delta",
    });
  }

  for (const slice of input.slices) {
    if (slice.learnedCount < SAMPLE_ARM_MIN) {
      guidance.push({
        gate: "impact_slice_arm",
        sliceKey: slice.sliceKey,
        arm: "learned",
        currentCount: slice.learnedCount,
        requiredCount: SAMPLE_ARM_MIN,
        additionalNeeded: computeAdditionalNeeded(
          slice.learnedCount,
          SAMPLE_ARM_MIN
        ),
        blockedClaim: "learning impact movement delta",
      });
    }

    if (slice.nonLearnedCount < SAMPLE_ARM_MIN) {
      guidance.push({
        gate: "impact_slice_arm",
        sliceKey: slice.sliceKey,
        arm: "non_learned",
        currentCount: slice.nonLearnedCount,
        requiredCount: SAMPLE_ARM_MIN,
        additionalNeeded: computeAdditionalNeeded(
          slice.nonLearnedCount,
          SAMPLE_ARM_MIN
        ),
        blockedClaim: "learning impact movement delta",
      });
    }
  }

  return guidance;
}

export interface QualityImprovementArmCounts {
  reason: string;
  beforeCount: number;
  afterCount: number;
}

export function buildQualityImprovementGuidance(
  reasonCounts: QualityImprovementArmCounts[]
): SampleGuidance[] {
  const guidance: SampleGuidance[] = [];

  for (const { reason, beforeCount, afterCount } of reasonCounts) {
    if (beforeCount < SAMPLE_SLICE_MIN) {
      guidance.push({
        gate: "quality_improvement_reason",
        dimension: reason,
        arm: "before",
        currentCount: beforeCount,
        requiredCount: SAMPLE_SLICE_MIN,
        additionalNeeded: computeAdditionalNeeded(
          beforeCount,
          SAMPLE_SLICE_MIN
        ),
        blockedClaim: "targeted failure-frequency improvement",
      });
    }

    if (afterCount < SAMPLE_SLICE_MIN) {
      guidance.push({
        gate: "quality_improvement_reason",
        dimension: reason,
        arm: "after",
        currentCount: afterCount,
        requiredCount: SAMPLE_SLICE_MIN,
        additionalNeeded: computeAdditionalNeeded(
          afterCount,
          SAMPLE_SLICE_MIN
        ),
        blockedClaim: "targeted failure-frequency improvement",
      });
    }
  }

  return guidance;
}
