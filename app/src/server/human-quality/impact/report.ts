import {
  computeArmMetrics,
  computeCohortMovement,
  computeGlobalVisualDelta,
  computeSliceComparison,
  partitionImpactSlices,
  MIN_ARM_SAMPLE,
} from "./aggregate";
import type { BuildImpactRowsResult } from "./enrich";
import type {
  ImpactEvaluatedRow,
  LearningImpactFactualMetrics,
  LearningImpactIntentMetrics,
  LearningImpactReport,
  LearningImpactVisualMovementMetrics,
} from "./types";
import { LEARNING_IMPACT_VERSION } from "./types";

export const MIN_GLOBAL_IMPACT_ITEMS = 5;
export { MIN_ARM_SAMPLE };

export interface BuildLearningImpactReportInput {
  rows: ImpactEvaluatedRow[];
  unlabeledCount: number;
  capturedAt: string;
  learningImpactVersion?: string;
}

function buildIntentMetrics(rows: ImpactEvaluatedRow[]): LearningImpactIntentMetrics {
  const learnedRows = rows.filter((row) => row.learningApplied);
  const nonLearnedRows = rows.filter((row) => !row.learningApplied);
  const learned = computeArmMetrics(learnedRows);
  const nonLearned = computeArmMetrics(nonLearnedRows);

  return {
    learned: {
      rejectRate: learned.rejectIntentRate,
      regenerateRate: learned.regenerateIntentRate,
    },
    nonLearned: {
      rejectRate: nonLearned.rejectIntentRate,
      regenerateRate: nonLearned.regenerateIntentRate,
    },
  };
}

function buildFactualMetrics(
  rows: ImpactEvaluatedRow[]
): LearningImpactFactualMetrics {
  const learnedRows = rows.filter((row) => row.learningApplied);
  const nonLearnedRows = rows.filter((row) => !row.learningApplied);
  const learned = computeArmMetrics(learnedRows);
  const nonLearned = computeArmMetrics(nonLearnedRows);

  return {
    learnedFactualPassRate: learned.factualPassRate,
    nonLearnedFactualPassRate: nonLearned.factualPassRate,
  };
}

function buildVisualMovementMetrics(
  rows: ImpactEvaluatedRow[],
  status: LearningImpactReport["status"]
): LearningImpactVisualMovementMetrics {
  const learnedRows = rows.filter((row) => row.learningApplied);
  const nonLearnedRows = rows.filter((row) => !row.learningApplied);
  const learned = computeArmMetrics(learnedRows);
  const nonLearned = computeArmMetrics(nonLearnedRows);

  const deltaLearnedMinusNonLearned =
    status === "ok" &&
    learned.meanVisualScore !== null &&
    nonLearned.meanVisualScore !== null
      ? learned.meanVisualScore - nonLearned.meanVisualScore
      : null;

  return {
    learnedMeanVisualScore: learned.meanVisualScore,
    nonLearnedMeanVisualScore: nonLearned.meanVisualScore,
    deltaLearnedMinusNonLearned,
    cohortMovement: computeCohortMovement(rows),
  };
}

function resolveReportStatus(
  rows: ImpactEvaluatedRow[],
  slices: ReturnType<typeof computeSliceComparison>[]
): {
  status: LearningImpactReport["status"];
  insufficientReasons: string[];
} {
  const insufficientReasons: string[] = [];

  if (rows.length < MIN_GLOBAL_IMPACT_ITEMS) {
    insufficientReasons.push("global_below_minimum");
  }

  const hasComparableSlice = slices.some(
    (slice) => slice.comparability === "ok"
  );

  if (!hasComparableSlice) {
    insufficientReasons.push("no_comparable_slices");
  }

  const status =
    rows.length >= MIN_GLOBAL_IMPACT_ITEMS && hasComparableSlice
      ? "ok"
      : "insufficient_sample";

  return { status, insufficientReasons };
}

export function buildLearningImpactReport(
  input: BuildLearningImpactReportInput
): LearningImpactReport {
  const { rows, unlabeledCount, capturedAt } = input;
  const learningImpactVersion =
    input.learningImpactVersion ?? LEARNING_IMPACT_VERSION;

  const partitions = partitionImpactSlices(rows);
  const slices = Array.from(partitions.entries()).map(([sliceKey, sliceRows]) =>
    computeSliceComparison(sliceKey, sliceRows)
  );

  const { status, insufficientReasons } = resolveReportStatus(rows, slices);
  const learnedCount = rows.filter((row) => row.learningApplied).length;
  const nonLearnedCount = rows.length - learnedCount;

  const globalVisualScoreDelta =
    status === "ok" ? computeGlobalVisualDelta(slices) : null;

  return {
    schemaVersion: 1,
    learningImpactVersion,
    capturedAt,
    status,
    evaluatedItemCount: rows.length,
    insufficientReasons,
    learningImpactMetrics: {
      learnedCount,
      nonLearnedCount,
      unlabeledCount,
      slices,
      globalVisualScoreDelta,
    },
    intentMetrics: buildIntentMetrics(rows),
    visualMovementMetrics: buildVisualMovementMetrics(rows, status),
    factualMetrics: buildFactualMetrics(rows),
    rows,
  };
}

export function buildLearningImpactReportFromEnriched(
  enriched: BuildImpactRowsResult,
  capturedAt: string
): LearningImpactReport {
  return buildLearningImpactReport({
    rows: enriched.rows,
    unlabeledCount: enriched.unlabeledCount,
    capturedAt,
  });
}
