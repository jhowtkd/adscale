import type { EvaluatedCorpusRow } from "../calibration/types";
import { buildTrendGuidance } from "../sampling/guidance";
import {
  TREND_GLOBAL_MIN_EVALUATED,
  TREND_MIN_TIME_BUCKETS,
} from "../sampling/thresholds";
import {
  computeBucketMetrics,
  detectRegression,
  EVIDENCE_CAP,
} from "./aggregate";
import { groupEvaluatedRowsByBucket } from "./bucket";
import type {
  QualityTrendReport,
  TrendAlertFlags,
  TrendBucket,
  TrendBucketEvidenceRef,
} from "./types";

export interface BuildQualityTrendReportInput {
  rows: EvaluatedCorpusRow[];
  capturedAt: string;
  truncated?: boolean;
}

function readCreatedAtIso(row: EvaluatedCorpusRow): string | null {
  const createdAt = row.evaluation?.createdAt;
  if (!createdAt) {
    return null;
  }
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readVisualScore(row: EvaluatedCorpusRow): number {
  const score = row.evaluation?.visualScore;
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

function readFactualPass(row: EvaluatedCorpusRow): boolean {
  return row.evaluation?.factualPass === true;
}

function buildBucketEvidenceRef(
  bucketKey: string,
  rows: EvaluatedCorpusRow[]
): TrendBucketEvidenceRef {
  const itemRefs = rows
    .map((row) => {
      const evaluatedAt = readCreatedAtIso(row);
      if (!evaluatedAt) {
        return null;
      }

      return {
        corpusItemId: row.item.id,
        visualScore: readVisualScore(row),
        factualPass: readFactualPass(row),
        evaluatedAt,
      };
    })
    .filter(
      (
        itemRef
      ): itemRef is NonNullable<typeof itemRef> => itemRef !== null
    )
    .sort((left, right) => right.evaluatedAt.localeCompare(left.evaluatedAt));

  const totalCount = itemRefs.length;
  const cappedRefs = itemRefs.slice(0, EVIDENCE_CAP);

  return {
    bucketKey,
    corpusItemIds: cappedRefs.map((itemRef) => itemRef.corpusItemId),
    itemRefs: cappedRefs,
    truncated: totalCount > EVIDENCE_CAP,
    totalCount,
  };
}

function resolveLatestEvaluatedAt(rows: EvaluatedCorpusRow[]): string | null {
  const timestamps = rows
    .map(readCreatedAtIso)
    .filter((value): value is string => value !== null);

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort().at(-1) ?? null;
}

function buildAlertFlags(input: {
  status: QualityTrendReport["status"];
  sampleGuidance: QualityTrendReport["sampleGuidance"];
  capturedAt: string;
  latestEvaluatedAt: string | null;
  buckets: TrendBucket[];
}): TrendAlertFlags {
  const insufficientCoverage =
    input.status === "insufficient_sample" || input.sampleGuidance.length > 0;
  const staleEvidence =
    input.latestEvaluatedAt !== null &&
    input.latestEvaluatedAt > input.capturedAt;
  const regressionDetected = detectRegression(input.buckets);

  const reasons: TrendAlertFlags["reasons"] = {};

  if (insufficientCoverage) {
    reasons.insufficientCoverage =
      "Live corpus sample is below trend thresholds; trend direction is withheld.";
  }
  if (staleEvidence) {
    reasons.staleEvidence =
      "New human evaluations exist after this report was captured.";
  }
  if (regressionDetected) {
    reasons.regressionDetected =
      "Mean human visual score dropped by at least 5 points between the last two populated weeks.";
  }

  return {
    insufficientCoverage,
    staleEvidence,
    regressionDetected,
    reasons: Object.keys(reasons).length > 0 ? reasons : undefined,
  };
}

export function buildQualityTrendReport(
  input: BuildQualityTrendReportInput
): QualityTrendReport {
  const grouped = groupEvaluatedRowsByBucket(input.rows);
  const bucketKeys = [...grouped.keys()].sort((left, right) =>
    left.localeCompare(right)
  );

  const buckets: TrendBucket[] = bucketKeys.map((bucketKey) => {
    const bucketRows = grouped.get(bucketKey) ?? [];
    const metrics = computeBucketMetrics(bucketKey, bucketRows);

    return {
      ...metrics,
      evidenceRefs:
        metrics.count > 0
          ? buildBucketEvidenceRef(bucketKey, bucketRows)
          : null,
    };
  });

  const evaluatedItemCount = input.rows.length;
  const populatedBucketCount = buckets.filter((bucket) => bucket.count > 0)
    .length;
  const sampleGuidance = buildTrendGuidance({
    evaluatedItemCount,
    populatedBucketCount,
  });
  const status =
    evaluatedItemCount >= TREND_GLOBAL_MIN_EVALUATED &&
    populatedBucketCount >= TREND_MIN_TIME_BUCKETS
      ? "ok"
      : "insufficient_sample";
  const latestEvaluatedAt = resolveLatestEvaluatedAt(input.rows);
  const alertFlags = buildAlertFlags({
    status,
    sampleGuidance,
    capturedAt: input.capturedAt,
    latestEvaluatedAt,
    buckets,
  });

  return {
    status,
    evaluatedItemCount,
    populatedBucketCount,
    buckets,
    alertFlags,
    sampleGuidance,
    capturedAt: input.capturedAt,
    latestEvaluatedAt,
    truncated: input.truncated,
    evidenceSource: "live_human",
  };
}
