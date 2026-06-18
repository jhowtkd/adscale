import { buildImpactRow } from "../impact/enrich";
import type { EvaluatedCorpusRow } from "../calibration/types";
import { TREND_SLICE_MIN } from "../sampling/thresholds";
import { bucketPeriodForKey } from "./bucket";
import type { TrendBucket, TrendLearningImpactStatus } from "./types";

export const TREND_REGRESSION_VISUAL_DROP_THRESHOLD = 5;

const EVIDENCE_CAP = 100;

function readVisualScore(row: EvaluatedCorpusRow): number | null {
  const score = row.evaluation?.visualScore;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function readFactualPass(row: EvaluatedCorpusRow): boolean | null {
  const factualPass = row.evaluation?.factualPass;
  return typeof factualPass === "boolean" ? factualPass : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeLearningImpactStatus(
  rows: EvaluatedCorpusRow[]
): TrendLearningImpactStatus {
  const impactRows = rows.map(buildImpactRow);
  const learnedCount = impactRows.filter((row) => row.learningApplied).length;
  const nonLearnedCount = impactRows.length - learnedCount;

  if (
    learnedCount >= TREND_SLICE_MIN &&
    nonLearnedCount >= TREND_SLICE_MIN
  ) {
    return "ok";
  }

  return "insufficient_sample";
}

export interface BucketMetricsResult {
  bucketKey: string;
  periodStart: string;
  periodEnd: string;
  count: number;
  meanHumanVisualScore: number | null;
  factualPassRate: number | null;
  learningImpactStatus: TrendLearningImpactStatus;
}

export function computeBucketMetrics(
  bucketKey: string,
  rows: EvaluatedCorpusRow[]
): BucketMetricsResult {
  const { periodStart, periodEnd } = bucketPeriodForKey(bucketKey);
  const visualScores = rows
    .map(readVisualScore)
    .filter((score): score is number => score !== null);
  const factualPasses = rows
    .map(readFactualPass)
    .filter((value): value is boolean => value !== null);

  return {
    bucketKey,
    periodStart,
    periodEnd,
    count: rows.length,
    meanHumanVisualScore: mean(visualScores),
    factualPassRate:
      factualPasses.length > 0
        ? factualPasses.filter(Boolean).length / factualPasses.length
        : null,
    learningImpactStatus: computeLearningImpactStatus(rows),
  };
}

export function detectRegression(buckets: TrendBucket[]): boolean {
  const populatedBuckets = [...buckets]
    .filter((bucket) => bucket.count > 0)
    .sort((left, right) => left.bucketKey.localeCompare(right.bucketKey));

  if (populatedBuckets.length < 2) {
    return false;
  }

  const previous = populatedBuckets[populatedBuckets.length - 2];
  const latest = populatedBuckets[populatedBuckets.length - 1];

  if (
    previous.count < TREND_SLICE_MIN ||
    latest.count < TREND_SLICE_MIN ||
    previous.meanHumanVisualScore === null ||
    latest.meanHumanVisualScore === null
  ) {
    return false;
  }

  const drop = previous.meanHumanVisualScore - latest.meanHumanVisualScore;
  return drop >= TREND_REGRESSION_VISUAL_DROP_THRESHOLD;
}

export { EVIDENCE_CAP };
