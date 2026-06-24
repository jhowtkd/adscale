import { buildCalibrationGuidance } from "../sampling/guidance";
import {
  MIN_GLOBAL_EVALUATED_ITEMS,
  MIN_SLICE_SAMPLE,
} from "../sampling/thresholds";
import type { SampleGuidance } from "../sampling/types";
import {
  aggregateGroup,
  buildFactualMetrics,
  groupComparisonsBy,
  type FactualMetrics,
  type GroupSlice,
} from "./aggregate";
import type { RubricCalibrationAdjustment } from "../../db/schema";
import type { CalibrationAdjustmentEvidence, CalibrationComparison } from "./types";

export { MIN_GLOBAL_EVALUATED_ITEMS, MIN_SLICE_SAMPLE };
export const RUBRIC_CALIBRATION_VERSION = "1.1.0";

export interface AdjustmentProposalSummary {
  id?: string;
  adjustmentVersion: string;
  targetModule: string;
  targetKey: string;
  status: "proposed";
  evidenceCount: number;
  rationale?: string;
  evidenceRefs?: CalibrationAdjustmentEvidence;
}

export function toAdjustmentProposalSummaryFromRow(
  row: RubricCalibrationAdjustment
): AdjustmentProposalSummary {
  return {
    id: row.id,
    adjustmentVersion: row.adjustmentVersion,
    targetModule: row.targetModule,
    targetKey: row.targetKey,
    status: "proposed",
    evidenceCount: row.evidenceRefs.corpusItemIds.length,
    rationale: row.rationale,
    evidenceRefs: row.evidenceRefs,
  };
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
  sampleGuidance: SampleGuidance[];
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
    sampleGuidance: hasSufficientCorpus
      ? []
      : buildCalibrationGuidance(comparisons.length),
    visualMetrics: buildVisualMetrics(comparisons, hasSufficientCorpus),
    factualMetrics: buildFactualMetrics(comparisons),
    adjustments: [],
  };
}
