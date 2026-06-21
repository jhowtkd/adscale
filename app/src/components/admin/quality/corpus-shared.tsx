"use client";

import { apiFetch } from "@/lib/api-client";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_FAILURE_REASONS,
  HUMAN_QUALITY_INTENTS,
  HUMAN_QUALITY_SOURCE_LABELS,
  type HumanQualityCorpusCohort,
  type HumanQualityFailureReason,
  type HumanQualityIntent,
  type HumanQualityQualitySnapshot,
  type HumanQualitySourceLabel,
} from "@/server/human-quality/corpus";
import type { GroupSlice } from "@/server/human-quality/calibration/aggregate";
import type { CalibrationComparison } from "@/server/human-quality/calibration/types";
import type { AdjustmentProposalSummary } from "@/server/human-quality/calibration/report";
import type { SampleGuidance } from "@/server/human-quality/sampling/types";

export type CorpusQueueItem = {
  id: string;
  workspaceId: string;
  campaignId: string;
  derivationId: string;
  generationMode: string;
  format: string;
  cohort: string;
  corpusVersion: number;
  artifactRef: { derivationId: string; assetId?: string | null; styleAssetId?: string | null };
  qualitySnapshot: HumanQualityQualitySnapshot;
  selectedAt: string;
  previewImageUrl?: string | null;
  sourceLabel?: HumanQualitySourceLabel;
};

type CorpusStatusCount = {
  pending: number;
  evaluated: number;
};

export type CorpusQueueProgress = {
  workspaceId: string | null;
  totalPending: number;
  totalEvaluated: number;
  byCohort: Record<string, CorpusStatusCount>;
  byGenerationMode: Record<string, CorpusStatusCount>;
  byFormat: Record<string, CorpusStatusCount>;
  byCampaign: Record<string, CorpusStatusCount>;
  latestSelectedAt: string | null;
  latestEvaluatedAt: string | null;
};

export type CorpusQueueResponse = {
  items: CorpusQueueItem[];
  progress?: CorpusQueueProgress;
};

/** Ephemeral preview fields must never be posted back to the corpus API. */
export const FORBIDDEN_EVALUATION_PAYLOAD_KEYS = [
  "previewImageUrl",
  "signedUrl",
  "outputKey",
  "prompt",
  "model",
  "modelResponse",
  "imageBytes",
] as const;

type ImpactSliceComparison = {
  sliceKey: string;
  learned: {
    count: number;
    meanVisualScore: number | null;
    rejectIntentRate: number | null;
    regenerateIntentRate: number | null;
    factualPassRate: number | null;
  };
  nonLearned: {
    count: number;
    meanVisualScore: number | null;
    rejectIntentRate: number | null;
    regenerateIntentRate: number | null;
    factualPassRate: number | null;
  };
  visualScoreDelta: number | null;
  comparability: "ok" | "insufficient";
};

export type ImpactReportResponse = {
  schemaVersion: 1;
  learningImpactVersion: string;
  capturedAt: string;
  status: "ok" | "insufficient_sample";
  evaluatedItemCount: number;
  insufficientReasons: string[];
  sampleGuidance?: SampleGuidance[];
  truncated?: boolean;
  totalRowCount?: number;
  learningImpactMetrics: {
    learnedCount: number;
    nonLearnedCount: number;
    unlabeledCount: number;
    slices: ImpactSliceComparison[];
    globalVisualScoreDelta: number | null;
  };
  intentMetrics: {
    learned: { rejectRate: number | null; regenerateRate: number | null };
    nonLearned: { rejectRate: number | null; regenerateRate: number | null };
  };
  visualMovementMetrics: {
    learnedMeanVisualScore: number | null;
    nonLearnedMeanVisualScore: number | null;
    deltaLearnedMinusNonLearned: number | null;
    cohortMovement?: {
      preLearningMean: number | null;
      postLearningMean: number | null;
      deltaPostMinusPre: number | null;
    };
  };
  factualMetrics: {
    learnedFactualPassRate: number | null;
    nonLearnedFactualPassRate: number | null;
  };
  rows: Array<{
    corpusItemId: string;
    learningApplied: boolean;
    visualScore: number;
    factualPass: boolean;
    intent: string;
    generationMode: string;
    format: string;
  }>;
};

type QualityFailureFrequency = Record<
  string,
  {
    count: number;
    rate: number | null;
  }
>;

export type QualityReportResponse = {
  schemaVersion: 1;
  rubricCalibrationVersion: string;
  capturedAt: string;
  status: "ok" | "insufficient_sample";
  targetedFailureReasons: HumanQualityFailureReason[];
  sampleGuidance?: SampleGuidance[];
  truncated?: boolean;
  totalComparisonCount?: number;
  visualMetrics: {
    failureFrequencyBefore: QualityFailureFrequency;
    failureFrequencyAfter: QualityFailureFrequency;
    deltaRateByReason: Record<string, number | null>;
  };
  factualMetrics: {
    factualPassRateBefore: number | null;
    factualPassRateAfter: number | null;
  };
  fixtureMetrics?: {
    targetedArchetypePassRateBefore: number | null;
    targetedArchetypePassRateAfter: number | null;
  };
  acceptedAdjustments: Array<{
    adjustmentId: string;
    targetModule: string;
    targetKey: string;
  }>;
};

export type CalibrationReportResponse = {
  schemaVersion: 1;
  rubricCalibrationVersion: string;
  capturedAt: string;
  snapshotCapturedAtNote: string;
  status: "ok" | "insufficient_corpus";
  evaluatedItemCount: number;
  sampleGuidance?: SampleGuidance[];
  truncated?: boolean;
  totalComparisonCount?: number;
  visualMetrics: {
    meanAbsError: number | null;
    meanSignedDelta: number | null;
    overScoreCount: number;
    underScoreCount: number;
    divergenceByFailureReason: Record<string, GroupSlice>;
    divergenceByMode: Record<string, GroupSlice>;
    divergenceByFormat: Record<string, GroupSlice>;
    comparisons: CalibrationComparison[];
  };
  factualMetrics: {
    factualPassRate: number | null;
    factualFailCount: number;
    highVisualButFactualFail: CalibrationComparison[];
  };
  adjustments: AdjustmentProposalSummary[];
};

export type GlobalCorpusEvidenceResponse = {
  schemaVersion: 1;
  capturedAt: string;
  evaluatedItemCount: number;
  pendingItemCount: number;
  sourceComposition: Record<HumanQualitySourceLabel, number>;
  fixtureOnly: boolean;
  operationalStatus: string;
  claimsAllowed: string[];
  claimsBlocked: string[];
  withheldClaims: string[];
  dependsOnOperator: string[];
};

export async function fetchGlobalCorpusEvidence(
  cohort: HumanQualityCorpusCohort | ""
): Promise<GlobalCorpusEvidenceResponse | null> {
  const params = new URLSearchParams();
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/global-corpus-evidence?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: GlobalCorpusEvidenceResponse };
  return payload.report;
}

export type SampleCoverageReportResponse = {
  schemaVersion: 1;
  capturedAt: string;
  evaluatedItemCount: number;
  gates: Array<{
    id: string;
    status: string;
    blockedClaims: string[];
  }>;
  sliceGaps: SampleGuidance[];
  nextGate: string;
  nextOperatorAction: string;
};

type TrendBucketEvidenceItemRef = {
  corpusItemId: string;
  visualScore: number;
  factualPass: boolean;
  evaluatedAt: string;
};

type TrendBucket = {
  bucketKey: string;
  periodStart: string;
  periodEnd: string;
  count: number;
  meanHumanVisualScore: number | null;
  factualPassRate: number | null;
  learningImpactStatus: "ok" | "insufficient_sample";
  evidenceRefs: {
    bucketKey: string;
    corpusItemIds: string[];
    itemRefs: TrendBucketEvidenceItemRef[];
    truncated: boolean;
    totalCount: number;
  } | null;
};

export type QualityTrendReportResponse = {
  status: "ok" | "insufficient_sample";
  evaluatedItemCount: number;
  populatedBucketCount: number;
  buckets: TrendBucket[];
  alertFlags: {
    insufficientCoverage: boolean;
    staleEvidence: boolean;
    regressionDetected: boolean;
    reasons?: {
      insufficientCoverage?: string;
      staleEvidence?: string;
      regressionDetected?: string;
    };
  };
  sampleGuidance: SampleGuidance[];
  capturedAt: string;
  latestEvaluatedAt: string | null;
  truncated?: boolean;
  evidenceSource: "live_human";
};

export type TrendDimensionFilters = {
  generationMode: string;
  format: string;
  clientProfileId: string;
  primaryFailureReason: HumanQualityFailureReason | "";
};

export const FAILURE_REASON_LABELS: Record<HumanQualityFailureReason, string> = {
  visual_overload: "Visual overload",
  weak_hierarchy: "Weak hierarchy",
  generic_template_feel: "Generic template feel",
  illegible_cta: "Illegible CTA",
  unfocused_composition: "Unfocused composition",
  factual_issue: "Factual issue",
  format_or_crop_issue: "Format or crop issue",
  other: "Other",
};

export const INTENT_LABELS: Record<HumanQualityIntent, string> = {
  approve: "Approve",
  reject: "Reject",
  regenerate: "Regenerate",
};

export const TREND_GENERATION_MODES = ["art_variation", "format_adaptation", "restyling"] as const;
export const TREND_FORMATS = ["1:1", "4:5", "9:16", "16:9", "1.91:1"] as const;

export type CorpusScope = "global" | "workspace";

export type CorpusQueueFilterState = {
  cohort: HumanQualityCorpusCohort | "";
  generationMode: string;
  format: string;
  sourceLabel: HumanQualitySourceLabel | "";
  status: "pending" | "evaluated" | "removed";
};

export const DEFAULT_QUEUE_FILTERS: CorpusQueueFilterState = {
  cohort: "",
  generationMode: "",
  format: "",
  sourceLabel: "",
  status: "pending",
};

export async function fetchCorpusCandidates(
  workspaceId: string | undefined
): Promise<CorpusCandidateListResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  const res = await apiFetch(`/api/feedback/human-quality-corpus/candidates?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as CorpusCandidateListResponse;
}

export type CorpusCandidateListResponse = {
  items: Array<{
    id: string;
    workspaceId: string;
    campaignId: string;
    derivationId: string;
    generationMode: string;
    format: string;
    corpusVersion: number;
    sourceLabel: HumanQualitySourceLabel;
    qualitySnapshot: { qualityScore?: number | null; qualityVerdict?: string | null };
    capturedAt: string;
    previewImageUrl: string | null;
  }>;
  total: number;
};

export async function fetchPendingQueue(
  workspaceId: string | undefined,
  filters: CorpusQueueFilterState
): Promise<CorpusQueueResponse | null> {
  const params = new URLSearchParams({
    limit: "50",
    includeProgress: "true",
    status: filters.status,
  });
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  if (filters.cohort) params.set("cohort", filters.cohort);
  if (filters.generationMode) params.set("generationMode", filters.generationMode);
  if (filters.format) params.set("format", filters.format);
  if (filters.sourceLabel) params.set("sourceLabel", filters.sourceLabel);
  const res = await apiFetch(`/api/feedback/human-quality-corpus?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as CorpusQueueResponse;
}

export async function fetchCalibrationReport(
  workspaceId: string | undefined,
  cohort: HumanQualityCorpusCohort | ""
): Promise<CalibrationReportResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/score-calibration?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: CalibrationReportResponse };
  return payload.report;
}

export async function fetchLearningImpactReport(
  workspaceId: string | undefined,
  cohort: HumanQualityCorpusCohort | ""
): Promise<ImpactReportResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/learning-impact?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: ImpactReportResponse };
  return payload.report;
}

export async function fetchQualityImprovementReport(
  workspaceId: string | undefined,
  cohort: HumanQualityCorpusCohort | ""
): Promise<QualityReportResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/quality-improvement?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: QualityReportResponse };
  return payload.report;
}

export async function fetchSampleCoverage(
  workspaceId: string | undefined,
  cohort: HumanQualityCorpusCohort | ""
): Promise<SampleCoverageReportResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/sample-coverage?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: SampleCoverageReportResponse };
  return payload.report;
}

export async function fetchQualityTrendReport(
  workspaceId: string | undefined,
  cohort: HumanQualityCorpusCohort | "",
  filters: TrendDimensionFilters
): Promise<QualityTrendReportResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (cohort) params.set("cohort", cohort);
  if (filters.generationMode) params.set("generationMode", filters.generationMode);
  if (filters.format) params.set("format", filters.format);
  if (filters.clientProfileId) params.set("clientProfileId", filters.clientProfileId);
  if (filters.primaryFailureReason) {
    params.set("primaryFailureReason", filters.primaryFailureReason);
  }
  const res = await apiFetch(`/api/feedback/quality-trend?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: QualityTrendReportResponse };
  return payload.report;
}
export function guidanceItemKey(item: SampleGuidance): string {
  return `${item.gate}-${item.sliceKey ?? item.dimension ?? "global"}-${item.arm ?? ""}`;
}

export function SampleGuidanceList({
  guidance,
  fallback,
}: {
  guidance?: SampleGuidance[];
  fallback: string;
}) {
  if (!guidance || guidance.length === 0) {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
        {fallback}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
      <p className="text-xs font-medium">Sample guidance from API thresholds:</p>
      <ul className="list-inside list-disc text-xs">
        {guidance.map((item) => (
          <li key={guidanceItemKey(item)}>
            Need {item.additionalNeeded} more for {item.blockedClaim} ({item.currentCount}/
            {item.requiredCount})
            {item.sliceKey ? ` · slice ${item.sliceKey}` : ""}
            {item.dimension ? ` · ${item.dimension}` : ""}
            {item.arm ? ` · ${item.arm} arm` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function formatRate(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

export function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function ProgressBreakdownTable({
  title,
  slices,
}: {
  title: string;
  slices: Record<string, CorpusStatusCount>;
}) {
  const entries = Object.entries(slices);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h4>
      <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
        <table className="min-w-full text-[11px]">
          <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Slice</th>
              <th className="px-2 py-1 text-right font-medium">Pending</th>
              <th className="px-2 py-1 text-right font-medium">Evaluated</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([sliceKey, counts]) => (
              <tr key={sliceKey} className="border-t border-[var(--border-dim)]">
                <td className="px-2 py-1 text-[var(--text-primary)]">{sliceKey}</td>
                <td className="px-2 py-1 text-right">{counts.pending}</td>
                <td className="px-2 py-1 text-right">{counts.evaluated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QueueProgressSummary({
  progress,
  reviewPosition,
  pendingInView,
}: {
  progress: CorpusQueueProgress;
  reviewPosition: number;
  pendingInView: number;
}) {
  return (
    <div
      className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3"
      aria-label="Queue progress"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Queue progress</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          {progress.totalPending} pending · {progress.totalEvaluated} evaluated
        </p>
      </div>

      <p className="text-xs font-medium text-[var(--text-primary)]">
        Reviewing {reviewPosition} of {pendingInView} loaded pending
        {progress.totalPending > pendingInView
          ? ` (${progress.totalPending} total pending)`
          : ""}
      </p>

      <dl className="grid gap-2 sm:grid-cols-2">
        <MetadataRow
          label="Latest selected"
          value={
            progress.latestSelectedAt
              ? new Date(progress.latestSelectedAt).toLocaleString()
              : "—"
          }
        />
        <MetadataRow
          label="Latest evaluated"
          value={
            progress.latestEvaluatedAt
              ? new Date(progress.latestEvaluatedAt).toLocaleString()
              : "—"
          }
        />
      </dl>

      <div className="grid gap-3 lg:grid-cols-2">
        <ProgressBreakdownTable title="By cohort" slices={progress.byCohort} />
        <ProgressBreakdownTable title="By campaign" slices={progress.byCampaign} />
        <ProgressBreakdownTable title="By mode" slices={progress.byGenerationMode} />
        <ProgressBreakdownTable title="By format" slices={progress.byFormat} />
      </div>
    </div>
  );
}

export function buildEvaluationPayload(input: {
  workspaceId?: string;
  visualScore: number;
  factualPass: boolean;
  intent: HumanQualityIntent;
  primaryFailureReason: HumanQualityFailureReason;
  otherReasonText: string | null;
  notes: string | null;
}) {
  const payload: Record<string, unknown> = {
    visualScore: input.visualScore,
    factualPass: input.factualPass,
    intent: input.intent,
    primaryFailureReason: input.primaryFailureReason,
    otherReasonText: input.otherReasonText,
    notes: input.notes,
  };
  if (input.workspaceId) {
    payload.workspaceId = input.workspaceId;
  }
  return payload;
}

export function formatSignedDelta(value: number | null): string {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}

export function formatNullableNumber(value: number | null, digits = 2): string {
  if (value == null) return "—";
  return value.toFixed(digits);
}

export function SliceTable({
  title,
  slices,
}: {
  title: string;
  slices: Record<string, GroupSlice>;
}) {
  const entries = Object.entries(slices);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h4>
      <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
        <table className="min-w-full text-xs">
          <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Slice</th>
              <th className="px-2 py-1.5 text-right font-medium">Count</th>
              <th className="px-2 py-1.5 text-right font-medium">MAE</th>
              <th className="px-2 py-1.5 text-right font-medium">Bias</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([sliceKey, slice]) => (
              <tr key={sliceKey} className="border-t border-[var(--border-dim)]">
                <td className="px-2 py-1.5 text-[var(--text-primary)]">{sliceKey}</td>
                <td className="px-2 py-1.5 text-right">{slice.count}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatNullableNumber(slice.meanAbsError)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {formatSignedDelta(slice.meanSignedDelta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
