import type { SampleGuidance } from "../sampling/types";

export type TrendLearningImpactStatus = "ok" | "insufficient_sample";

export type TrendReportStatus = "ok" | "insufficient_sample";

export type TrendEvidenceSource = "live_human";

export interface TrendBucketEvidenceItemRef {
  corpusItemId: string;
  visualScore: number;
  factualPass: boolean;
  evaluatedAt: string;
}

export interface TrendBucketEvidenceRef {
  bucketKey: string;
  corpusItemIds: string[];
  itemRefs: TrendBucketEvidenceItemRef[];
  truncated: boolean;
  totalCount: number;
}

export interface TrendBucket {
  bucketKey: string;
  periodStart: string;
  periodEnd: string;
  count: number;
  meanHumanVisualScore: number | null;
  factualPassRate: number | null;
  learningImpactStatus: TrendLearningImpactStatus;
  evidenceRefs: TrendBucketEvidenceRef | null;
}

export interface TrendAlertFlagReasons {
  insufficientCoverage?: string;
  staleEvidence?: string;
  regressionDetected?: string;
}

export interface TrendAlertFlags {
  insufficientCoverage: boolean;
  staleEvidence: boolean;
  regressionDetected: boolean;
  reasons?: TrendAlertFlagReasons;
}

export interface QualityTrendReport {
  status: TrendReportStatus;
  evaluatedItemCount: number;
  populatedBucketCount: number;
  buckets: TrendBucket[];
  alertFlags: TrendAlertFlags;
  sampleGuidance: SampleGuidance[];
  capturedAt: string;
  latestEvaluatedAt: string | null;
  truncated?: boolean;
  evidenceSource: TrendEvidenceSource;
}
