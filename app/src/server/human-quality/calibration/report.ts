import {
  aggregateGroup,
  buildFactualMetrics,
  groupComparisonsBy,
  type FactualMetrics,
  type GroupSlice,
} from "./aggregate";
import type { CalibrationComparison } from "./types";

export const MIN_GLOBAL_EVALUATED_ITEMS = 5;
export const MIN_SLICE_SAMPLE = 3;
export const RUBRIC_CALIBRATION_VERSION = "1.0.0";

export interface AdjustmentProposalSummary {
  adjustmentVersion: string;
  targetModule: string;
  targetKey: string;
  status: "proposed";
  evidenceCount: number;
}

export interface CalibrationVisualMetrics {
  meanAbsError: number | null;
  meanSignedDelta: number | null;
  overScoreCount: number;
  underScoreCount: number;
  divergenceByFailureReason: Record<string, GroupSlice>;
  divergenceByMode: Record<string, GroupSlice>;
  divergenceByFormat: Record<string, GroupSlice>;
  comparisons: CalibrationComparison[];
}

export interface CalibrationReport {
  schemaVersion: 1;
  rubricCalibrationVersion: string;
  capturedAt: string;
  snapshotCapturedAtNote: string;
  status: "ok" | "insufficient_corpus";
  evaluatedItemCount: number;
  visualMetrics: CalibrationVisualMetrics;
  factualMetrics: FactualMetrics;
  adjustments: AdjustmentProposalSummary[];
}

export interface BuildCalibrationReportInput {
  comparisons: CalibrationComparison[];
  capturedAt: string;
  rubricCalibrationVersion?: string;
}

const SNAPSHOT_CAPTURED_AT_NOTE =
  "Automatic scores use qualitySnapshot frozen at corpus selection time; not live re-scored.";

function buildVisualMetrics(
  comparisons: CalibrationComparison[],
  includeAggregates: boolean
): CalibrationVisualMetrics {
  const globalSlice = aggregateGroup(comparisons);

  if (!includeAggregates) {
    return {
      meanAbsError: null,
      meanSignedDelta: null,
      overScoreCount: 0,
      underScoreCount: 0,
      divergenceByFailureReason: {},
      divergenceByMode: {},
      divergenceByFormat: {},
      comparisons,
    };
  }

  return {
    meanAbsError: globalSlice.meanAbsError,
    meanSignedDelta: globalSlice.meanSignedDelta,
    overScoreCount: globalSlice.overScoreCount,
    underScoreCount: globalSlice.underScoreCount,
    divergenceByFailureReason: groupComparisonsBy(comparisons, "primaryFailureReason"),
    divergenceByMode: groupComparisonsBy(comparisons, "generationMode"),
    divergenceByFormat: groupComparisonsBy(comparisons, "format"),
    comparisons,
  };
}

export function buildCalibrationReport(
  input: BuildCalibrationReportInput
): CalibrationReport {
  const { comparisons, capturedAt } = input;
  const rubricCalibrationVersion =
    input.rubricCalibrationVersion ?? RUBRIC_CALIBRATION_VERSION;
  const hasSufficientCorpus = comparisons.length >= MIN_GLOBAL_EVALUATED_ITEMS;

  return {
    schemaVersion: 1,
    rubricCalibrationVersion,
    capturedAt,
    snapshotCapturedAtNote: SNAPSHOT_CAPTURED_AT_NOTE,
    status: hasSufficientCorpus ? "ok" : "insufficient_corpus",
    evaluatedItemCount: comparisons.length,
    visualMetrics: buildVisualMetrics(comparisons, hasSufficientCorpus),
    factualMetrics: buildFactualMetrics(comparisons),
    adjustments: [],
  };
}
