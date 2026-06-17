import type {
  ImpactArmMetrics,
  ImpactEvaluatedRow,
  ImpactSliceComparison,
} from "./types";
import { buildImpactSliceKey } from "./types";

export const MIN_ARM_SAMPLE = 3;

export function partitionImpactSlices(
  rows: ImpactEvaluatedRow[]
): Map<string, ImpactEvaluatedRow[]> {
  const buckets = new Map<string, ImpactEvaluatedRow[]>();

  for (const row of rows) {
    const sliceKey = buildImpactSliceKey(row);
    const existing = buckets.get(sliceKey) ?? [];
    existing.push(row);
    buckets.set(sliceKey, existing);
  }

  return buckets;
}

export function computeArmMetrics(rows: ImpactEvaluatedRow[]): ImpactArmMetrics {
  if (rows.length === 0) {
    return {
      count: 0,
      meanVisualScore: null,
      rejectIntentRate: null,
      regenerateIntentRate: null,
      factualPassRate: null,
    };
  }

  const count = rows.length;
  const meanVisualScore =
    rows.reduce((sum, row) => sum + row.visualScore, 0) / count;
  const rejectCount = rows.filter((row) => row.intent === "reject").length;
  const regenerateCount = rows.filter(
    (row) => row.intent === "regenerate"
  ).length;
  const factualPassCount = rows.filter((row) => row.factualPass).length;

  return {
    count,
    meanVisualScore,
    rejectIntentRate: rejectCount / count,
    regenerateIntentRate: regenerateCount / count,
    factualPassRate: factualPassCount / count,
  };
}

export function computeSliceComparison(
  sliceKey: string,
  rows: ImpactEvaluatedRow[],
  minArmSample = MIN_ARM_SAMPLE
): ImpactSliceComparison {
  const learnedRows = rows.filter((row) => row.learningApplied === true);
  const nonLearnedRows = rows.filter((row) => row.learningApplied === false);

  const learned = computeArmMetrics(learnedRows);
  const nonLearned = computeArmMetrics(nonLearnedRows);

  const comparability =
    learned.count >= minArmSample && nonLearned.count >= minArmSample
      ? "ok"
      : "insufficient";

  const visualScoreDelta =
    comparability === "ok" &&
    learned.meanVisualScore !== null &&
    nonLearned.meanVisualScore !== null
      ? learned.meanVisualScore - nonLearned.meanVisualScore
      : null;

  return {
    sliceKey,
    learned,
    nonLearned,
    visualScoreDelta,
    comparability,
  };
}

export function computeGlobalVisualDelta(
  slices: ImpactSliceComparison[]
): number | null {
  const comparableDeltas = slices
    .filter(
      (slice) =>
        slice.comparability === "ok" && slice.visualScoreDelta !== null
    )
    .map((slice) => slice.visualScoreDelta as number);

  if (comparableDeltas.length === 0) {
    return null;
  }

  return (
    comparableDeltas.reduce((sum, delta) => sum + delta, 0) /
    comparableDeltas.length
  );
}

export interface CohortMovementMetrics {
  preLearningMean: number | null;
  postLearningMean: number | null;
  deltaPostMinusPre: number | null;
}

export function computeCohortMovement(
  rows: ImpactEvaluatedRow[]
): CohortMovementMetrics {
  const preLearningRows = rows.filter((row) => row.cohort === "pre_learning");
  const postLearningRows = rows.filter((row) => row.cohort === "post_learning");

  const preLearningMean =
    preLearningRows.length > 0
      ? preLearningRows.reduce((sum, row) => sum + row.visualScore, 0) /
        preLearningRows.length
      : null;

  const postLearningMean =
    postLearningRows.length > 0
      ? postLearningRows.reduce((sum, row) => sum + row.visualScore, 0) /
        postLearningRows.length
      : null;

  const deltaPostMinusPre =
    preLearningMean !== null && postLearningMean !== null
      ? postLearningMean - preLearningMean
      : null;

  return {
    preLearningMean,
    postLearningMean,
    deltaPostMinusPre,
  };
}
