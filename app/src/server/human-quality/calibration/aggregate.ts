import { DIVERGENCE_FLAG_THRESHOLD } from "./compare";
import type { CalibrationComparison } from "./types";

export interface GroupSlice {
  count: number;
  meanSignedDelta: number | null;
  meanAbsError: number | null;
  overScoreCount: number;
  underScoreCount: number;
}

export type GroupComparisonKey =
  | "primaryFailureReason"
  | "generationMode"
  | "format";

export function aggregateGroup(comparisons: CalibrationComparison[]): GroupSlice {
  const withDelta = comparisons.filter((c) => c.scoreDelta !== null);

  if (withDelta.length === 0) {
    return {
      count: 0,
      meanSignedDelta: null,
      meanAbsError: null,
      overScoreCount: 0,
      underScoreCount: 0,
    };
  }

  const deltas = withDelta.map((c) => c.scoreDelta as number);
  const meanSignedDelta = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
  const meanAbsError =
    deltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / deltas.length;

  return {
    count: withDelta.length,
    meanSignedDelta,
    meanAbsError,
    overScoreCount: deltas.filter((d) => d > DIVERGENCE_FLAG_THRESHOLD).length,
    underScoreCount: deltas.filter((d) => d < -DIVERGENCE_FLAG_THRESHOLD).length,
  };
}

export function groupComparisonsBy(
  comparisons: CalibrationComparison[],
  key: GroupComparisonKey
): Record<string, GroupSlice> {
  const buckets = new Map<string, CalibrationComparison[]>();

  for (const comparison of comparisons) {
    const sliceKey = comparison[key];
    const existing = buckets.get(sliceKey) ?? [];
    existing.push(comparison);
    buckets.set(sliceKey, existing);
  }

  const result: Record<string, GroupSlice> = {};
  for (const [sliceKey, sliceComparisons] of buckets) {
    result[sliceKey] = aggregateGroup(sliceComparisons);
  }

  return result;
}

export function buildCompositeSliceKey(
  reason: string,
  mode: string,
  format: string
): string {
  return `${reason}|${mode}|${format}`;
}
