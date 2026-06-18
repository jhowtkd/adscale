import { normalizeSamplingStatus } from "./guidance";
import { TREND_GLOBAL_MIN_EVALUATED } from "./thresholds";
import type {
  CalibrationSamplingStatus,
  SampleGuidance,
  SamplingStatus,
} from "./types";

export type CoverageNextGate =
  | "calibration"
  | "impact"
  | "quality_improvement"
  | "release";

export interface SampleCoverageGate {
  id: string;
  status: SamplingStatus | "insufficient_corpus";
  blockedClaims: string[];
}

export interface SampleCoverageReport {
  schemaVersion: 1;
  capturedAt: string;
  evaluatedItemCount: number;
  gates: SampleCoverageGate[];
  sliceGaps: SampleGuidance[];
  nextGate: CoverageNextGate;
  nextOperatorAction: string;
}

export interface BuildSampleCoverageReportInput {
  capturedAt: string;
  calibration: {
    status: CalibrationSamplingStatus;
    evaluatedItemCount: number;
    sampleGuidance: SampleGuidance[];
  };
  impact: {
    status: SamplingStatus;
    evaluatedItemCount: number;
    sampleGuidance: SampleGuidance[];
  };
  quality: {
    status: SamplingStatus;
    sampleGuidance: SampleGuidance[];
  };
}

function collectBlockedClaims(guidance: SampleGuidance[]): string[] {
  return [...new Set(guidance.map((item) => item.blockedClaim))];
}

function mergeSliceGaps(...guidanceLists: SampleGuidance[][]): SampleGuidance[] {
  return guidanceLists
    .flat()
    .sort((a, b) => b.additionalNeeded - a.additionalNeeded);
}

function resolveNextGate(
  calibrationStatus: CalibrationSamplingStatus,
  impactStatus: SamplingStatus,
  qualityStatus: SamplingStatus
): CoverageNextGate {
  if (calibrationStatus !== "ok") {
    return "calibration";
  }
  if (impactStatus !== "ok") {
    return "impact";
  }
  if (qualityStatus !== "ok") {
    return "quality_improvement";
  }
  return "release";
}

function buildNextOperatorAction(input: {
  evaluatedItemCount: number;
  nextGate: CoverageNextGate;
  sliceGaps: SampleGuidance[];
}): string {
  if (input.evaluatedItemCount === 0) {
    return "Evaluate corpus items in the human-quality queue — at least 5 human evaluations are required before calibration, impact, and quality improvement claims.";
  }

  if (input.nextGate === "release") {
    return "All sampling gates are satisfied for the current corpus snapshot. Stronger release claims may proceed when operational evidence is refreshed.";
  }

  const topGap = input.sliceGaps[0];
  if (!topGap) {
    return `Address ${input.nextGate} sampling gaps before stronger release claims.`;
  }

  const location =
    topGap.sliceKey != null
      ? ` in slice ${topGap.sliceKey}`
      : topGap.dimension != null
        ? ` for ${topGap.dimension}`
        : "";

  return `Need ${topGap.additionalNeeded} more evaluation${topGap.additionalNeeded === 1 ? "" : "s"}${location} for ${topGap.blockedClaim} (${topGap.currentCount}/${topGap.requiredCount}). Address ${input.nextGate} gaps before stronger release claims.`;
}

export function buildSampleCoverageReport(
  input: BuildSampleCoverageReportInput
): SampleCoverageReport {
  const sliceGaps = mergeSliceGaps(
    input.calibration.sampleGuidance,
    input.impact.sampleGuidance,
    input.quality.sampleGuidance
  );

  const calibrationNormalized = normalizeSamplingStatus(input.calibration.status);
  const impactNormalized = input.impact.status;
  const qualityNormalized = input.quality.status;

  const trendStatus: SamplingStatus =
    input.calibration.evaluatedItemCount >= TREND_GLOBAL_MIN_EVALUATED
      ? "ok"
      : "insufficient_sample";

  const gates: SampleCoverageGate[] = [
    {
      id: "calibration_global",
      status: calibrationNormalized,
      blockedClaims: collectBlockedClaims(
        input.calibration.sampleGuidance.filter((g) => g.gate === "calibration_global")
      ),
    },
    {
      id: "impact_global",
      status: impactNormalized,
      blockedClaims: collectBlockedClaims(
        input.impact.sampleGuidance.filter(
          (g) => g.gate === "impact_global" || g.gate === "impact_slice_arm"
        )
      ),
    },
    {
      id: "quality_improvement",
      status: qualityNormalized,
      blockedClaims: collectBlockedClaims(
        input.quality.sampleGuidance.filter((g) => g.gate === "quality_improvement_reason")
      ),
    },
    {
      id: "trend_global",
      status: trendStatus,
      blockedClaims:
        trendStatus === "ok"
          ? []
          : ["quality trend direction (trend charts deferred to Phase 136)"],
    },
  ];

  const nextGate = resolveNextGate(
    input.calibration.status,
    input.impact.status,
    input.quality.status
  );

  return {
    schemaVersion: 1,
    capturedAt: input.capturedAt,
    evaluatedItemCount: input.calibration.evaluatedItemCount,
    gates,
    sliceGaps,
    nextGate,
    nextOperatorAction: buildNextOperatorAction({
      evaluatedItemCount: input.calibration.evaluatedItemCount,
      nextGate,
      sliceGaps,
    }),
  };
}
