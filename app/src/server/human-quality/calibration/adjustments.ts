import { SCORE_CEILING_BY_FAILURE } from "../../ai/creative-score-ceilings";
import type { CreativeHardFailureCode } from "../../ai/creative-quality-gate";
import {
  aggregateGroup,
  buildCompositeSliceKey,
} from "./aggregate";
import { resolveAdjustmentTarget } from "./failure-bridge";
import {
  MIN_SLICE_SAMPLE,
  RUBRIC_CALIBRATION_VERSION,
  type AdjustmentProposalSummary,
} from "./report";
import type {
  CalibrationAdjustmentEvidence,
  CalibrationComparison,
} from "./types";

export interface ProposedAdjustment {
  adjustmentVersion: string;
  status: "proposed";
  targetModule: "score_ceiling" | "observable_rubric" | "gate_classifier";
  targetKey: string;
  sliceKey: string;
  rationale: string;
  evidenceRefs: CalibrationAdjustmentEvidence;
}

export interface ProposeAdjustmentsOptions {
  divergenceThreshold?: number;
  minSliceSample?: number;
  adjustmentVersion?: string;
}

function buildRationale(
  targetModule: ProposedAdjustment["targetModule"],
  targetKey: string,
  sliceStats: CalibrationAdjustmentEvidence["sliceStats"],
  sliceKey: string
): string {
  const direction = sliceStats.meanSignedDelta >= 0 ? "over-score" : "under-score";
  const absDelta = Math.abs(sliceStats.meanSignedDelta).toFixed(1);

  if (targetModule === "score_ceiling") {
    const ceiling =
      SCORE_CEILING_BY_FAILURE[targetKey as CreativeHardFailureCode] ?? 60;
    return `Slice ${sliceKey}: mean ${direction} ${absDelta} (n=${sliceStats.count}); current score_ceiling for ${targetKey} is ${ceiling}`;
  }

  if (targetModule === "observable_rubric") {
    return `Slice ${sliceKey}: mean ${direction} ${absDelta} (n=${sliceStats.count}); review observable_rubric constant ${targetKey}`;
  }

  return `Slice ${sliceKey}: mean ${direction} ${absDelta} (n=${sliceStats.count}); review gate_classifier target ${targetKey}`;
}

function groupByCompositeSlice(
  comparisons: CalibrationComparison[]
): Map<string, CalibrationComparison[]> {
  const buckets = new Map<string, CalibrationComparison[]>();

  for (const comparison of comparisons) {
    const sliceKey = buildCompositeSliceKey(
      comparison.primaryFailureReason,
      comparison.generationMode,
      comparison.format
    );
    const existing = buckets.get(sliceKey) ?? [];
    existing.push(comparison);
    buckets.set(sliceKey, existing);
  }

  return buckets;
}

function buildEvidenceRefs(
  sliceComparisons: CalibrationComparison[],
  sliceStats: CalibrationAdjustmentEvidence["sliceStats"]
): CalibrationAdjustmentEvidence {
  const itemRefs = sliceComparisons
    .filter((comparison) => comparison.scoreDelta !== null)
    .map((comparison) => ({
      corpusItemId: comparison.corpusItemId,
      scoreDelta: comparison.scoreDelta,
    }));

  return {
    corpusItemIds: itemRefs.map((ref) => ref.corpusItemId),
    sliceStats,
    itemRefs,
  };
}

export function proposeAdjustments(
  comparisons: CalibrationComparison[],
  options: ProposeAdjustmentsOptions = {}
): ProposedAdjustment[] {
  const divergenceThreshold = options.divergenceThreshold ?? 15;
  const minSliceSample = options.minSliceSample ?? MIN_SLICE_SAMPLE;
  const adjustmentVersion = options.adjustmentVersion ?? RUBRIC_CALIBRATION_VERSION;

  const proposals: ProposedAdjustment[] = [];
  const buckets = groupByCompositeSlice(comparisons);

  for (const [sliceKey, sliceComparisons] of buckets) {
    const sliceStatsRaw = aggregateGroup(sliceComparisons);

    if (sliceStatsRaw.count < minSliceSample) {
      continue;
    }

    if (
      sliceStatsRaw.meanSignedDelta === null ||
      Math.abs(sliceStatsRaw.meanSignedDelta) < divergenceThreshold
    ) {
      continue;
    }

    const primaryReason = sliceComparisons[0].primaryFailureReason;
    const target = resolveAdjustmentTarget(primaryReason);
    if (!target) {
      continue;
    }

    const sliceStats = {
      count: sliceStatsRaw.count,
      meanSignedDelta: sliceStatsRaw.meanSignedDelta,
      meanAbsError: sliceStatsRaw.meanAbsError,
    };

    proposals.push({
      adjustmentVersion,
      status: "proposed",
      targetModule: target.targetModule,
      targetKey: target.targetKey,
      sliceKey,
      rationale: buildRationale(
        target.targetModule,
        target.targetKey,
        sliceStats,
        sliceKey
      ),
      evidenceRefs: buildEvidenceRefs(sliceComparisons, sliceStats),
    });
  }

  return proposals;
}

export function toAdjustmentProposalSummaries(
  proposals: ProposedAdjustment[]
): AdjustmentProposalSummary[] {
  return proposals.map((proposal) => ({
    adjustmentVersion: proposal.adjustmentVersion,
    targetModule: proposal.targetModule,
    targetKey: proposal.targetKey,
    status: proposal.status,
    evidenceCount: proposal.evidenceRefs.corpusItemIds.length,
  }));
}
