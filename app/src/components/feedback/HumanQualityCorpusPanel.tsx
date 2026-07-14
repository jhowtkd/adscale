"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ResponsiveTabs from "@/components/layout/ResponsiveTabs";
import { CorpusIngestionBanner } from "@/components/feedback/CorpusIngestionBanner";
import { FactualAlertsPanel } from "@/components/feedback/FactualAlertsPanel";
import { LearningProposalsTab } from "@/components/feedback/LearningProposalsTab";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import {
  formatHumanQualitySourceLabel,
  getHumanQualitySourceCaveat,
} from "@/components/admin/calibration-status-copy";

type CorpusQueueItem = {
  id: string;
  workspaceId: string;
  clientProfileId?: string | null;
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

type CorpusQueueProgress = {
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

type CorpusQueueResponse = {
  items: CorpusQueueItem[];
  progress?: CorpusQueueProgress;
};

/** Ephemeral preview fields must never be posted back to the corpus API. */
const FORBIDDEN_EVALUATION_PAYLOAD_KEYS = [
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

type ImpactReportResponse = {
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

type QualityReportResponse = {
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

type CalibrationReportResponse = {
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

type GlobalCorpusEvidenceResponse = {
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

async function fetchGlobalCorpusEvidence(
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

type SampleCoverageReportResponse = {
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

type QualityTrendReportResponse = {
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

type TrendDimensionFilters = {
  generationMode: string;
  format: string;
  clientProfileId: string;
  primaryFailureReason: HumanQualityFailureReason | "";
};

const FAILURE_REASON_LABELS: Record<HumanQualityFailureReason, string> = {
  visual_overload: "Visual overload",
  weak_hierarchy: "Weak hierarchy",
  generic_template_feel: "Generic template feel",
  illegible_cta: "Illegible CTA",
  unfocused_composition: "Unfocused composition",
  factual_issue: "Factual issue",
  format_or_crop_issue: "Format or crop issue",
  other: "Other",
};

const INTENT_LABELS: Record<HumanQualityIntent, string> = {
  approve: "Approve",
  reject: "Reject",
  regenerate: "Regenerate",
};

const TREND_GENERATION_MODES = ["art_variation", "format_adaptation", "restyling"] as const;
const TREND_FORMATS = ["1:1", "4:5", "9:16", "16:9", "1.91:1"] as const;

const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);
const LineChart = dynamic(() => import("recharts").then((mod) => mod.LineChart), {
  ssr: false,
});
const Line = dynamic(() => import("recharts").then((mod) => mod.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false }
);

const PANEL_TABS = [
  { id: "queue", label: "Queue" },
  { id: "candidates", label: "Candidates" },
  { id: "learning", label: "Learning" },
  { id: "calibration", label: "Calibration" },
  { id: "impact", label: "Impact" },
  { id: "quality", label: "Quality" },
  { id: "coverage", label: "Coverage" },
  { id: "trend", label: "Trend" },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];

type CorpusScope = "global" | "workspace";

type CorpusQueueFilterState = {
  cohort: HumanQualityCorpusCohort | "";
  generationMode: string;
  format: string;
  sourceLabel: HumanQualitySourceLabel | "";
  clientProfileId: string;
  status: "pending" | "evaluated" | "removed";
};

const DEFAULT_QUEUE_FILTERS: CorpusQueueFilterState = {
  cohort: "",
  generationMode: "",
  format: "",
  sourceLabel: "",
  clientProfileId: "",
  status: "pending",
};

async function fetchCorpusCandidates(
  workspaceId: string | undefined
): Promise<CorpusCandidateListResponse | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  const res = await apiFetch(`/api/feedback/human-quality-corpus/candidates?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as CorpusCandidateListResponse;
}

type CorpusCandidateListResponse = {
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

async function fetchPendingQueue(
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
  if (filters.clientProfileId) params.set("clientProfileId", filters.clientProfileId);
  const res = await apiFetch(`/api/feedback/human-quality-corpus?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as CorpusQueueResponse;
}

async function fetchCalibrationReport(
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

async function fetchLearningImpactReport(
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

async function fetchQualityImprovementReport(
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

async function fetchSampleCoverage(
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

async function fetchQualityTrendReport(
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

function guidanceItemKey(item: SampleGuidance): string {
  return `${item.gate}-${item.sliceKey ?? item.dimension ?? "global"}-${item.arm ?? ""}`;
}

function SampleGuidanceList({
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

function formatRate(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function MetadataRow({ label, value }: { label: string; value: string }) {
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

function QueueProgressSummary({
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

function buildEvaluationPayload(input: {
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

function formatSignedDelta(value: number | null): string {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}

function formatNullableNumber(value: number | null, digits = 2): string {
  if (value == null) return "—";
  return value.toFixed(digits);
}

function SliceTable({
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

function ImpactReportView({
  report,
  isLoading,
  isError,
}: {
  report: ImpactReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading learning impact report…</p>;
  }

  if (isError || report == null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Learning impact report unavailable for this workspace.
      </p>
    );
  }

  const insufficient = report.status === "insufficient_sample";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Learning impact report</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Compares learned vs non-learned arms per client×mode×format slice.
        </p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label="Status" value={report.status} />
        <MetadataRow label="Evaluated items" value={String(report.evaluatedItemCount)} />
        <MetadataRow
          label="Learned arm"
          value={String(report.learningImpactMetrics.learnedCount)}
        />
        <MetadataRow
          label="Non-learned arm"
          value={String(report.learningImpactMetrics.nonLearnedCount)}
        />
        <MetadataRow
          label="Unlabeled"
          value={String(report.learningImpactMetrics.unlabeledCount)}
        />
      </dl>

      {insufficient ? (
        <div className="space-y-2">
          <SampleGuidanceList
            guidance={report.sampleGuidance}
            fallback="Sample size is insufficient to claim learning impact improvement. Movement deltas are withheld until comparability gates pass."
          />
          {report.insufficientReasons.length > 0 ? (
            <ul className="list-inside list-disc text-xs text-[var(--text-muted)]">
              {report.insufficientReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          Global visual delta (comparable slices):{" "}
          {formatSignedDelta(report.learningImpactMetrics.globalVisualScoreDelta)}
        </p>
      )}

      {report.learningImpactMetrics.slices.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Slice comparisons
          </h4>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Slice</th>
                  <th className="px-2 py-1.5 text-right font-medium">Learned n</th>
                  <th className="px-2 py-1.5 text-right font-medium">Non-learned n</th>
                  <th className="px-2 py-1.5 text-right font-medium">Visual Δ</th>
                  <th className="px-2 py-1.5 text-left font-medium">Comparability</th>
                </tr>
              </thead>
              <tbody>
                {report.learningImpactMetrics.slices.map((slice) => (
                  <tr key={slice.sliceKey} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5 font-mono text-[10px]">{slice.sliceKey}</td>
                    <td className="px-2 py-1.5 text-right">{slice.learned.count}</td>
                    <td className="px-2 py-1.5 text-right">{slice.nonLearned.count}</td>
                    <td className="px-2 py-1.5 text-right">
                      {formatSignedDelta(slice.visualScoreDelta)}
                    </td>
                    <td className="px-2 py-1.5">{slice.comparability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Intent metrics (per arm)
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label="Learned reject rate"
            value={formatRate(report.intentMetrics.learned.rejectRate)}
          />
          <MetadataRow
            label="Learned regenerate rate"
            value={formatRate(report.intentMetrics.learned.regenerateRate)}
          />
          <MetadataRow
            label="Non-learned reject rate"
            value={formatRate(report.intentMetrics.nonLearned.rejectRate)}
          />
          <MetadataRow
            label="Non-learned regenerate rate"
            value={formatRate(report.intentMetrics.nonLearned.regenerateRate)}
          />
        </dl>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Visual movement metrics
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label="Learned mean visual"
            value={formatNullableNumber(report.visualMovementMetrics.learnedMeanVisualScore, 1)}
          />
          <MetadataRow
            label="Non-learned mean visual"
            value={formatNullableNumber(report.visualMovementMetrics.nonLearnedMeanVisualScore, 1)}
          />
          <MetadataRow
            label="Δ learned − non-learned"
            value={formatSignedDelta(report.visualMovementMetrics.deltaLearnedMinusNonLearned)}
          />
        </dl>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Factual metrics (per arm)
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label="Learned factual pass rate"
            value={formatRate(report.factualMetrics.learnedFactualPassRate)}
          />
          <MetadataRow
            label="Non-learned factual pass rate"
            value={formatRate(report.factualMetrics.nonLearnedFactualPassRate)}
          />
        </dl>
      </div>

      {report.rows.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Evaluated rows
            </h4>
            {report.truncated ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                Showing {report.rows.length} of {report.totalRowCount ?? report.rows.length}
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-left font-medium">Learning</th>
                  <th className="px-2 py-1.5 text-right font-medium">Visual</th>
                  <th className="px-2 py-1.5 text-left font-medium">Intent</th>
                  <th className="px-2 py-1.5 text-left font-medium">Factual</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.corpusItemId} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {row.corpusItemId.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-1.5">
                      {row.learningApplied ? "learned" : "non-learned"}
                    </td>
                    <td className="px-2 py-1.5 text-right">{row.visualScore}</td>
                    <td className="px-2 py-1.5">{row.intent}</td>
                    <td className="px-2 py-1.5">{row.factualPass ? "pass" : "fail"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QualityImprovementReportView({
  report,
  isLoading,
  isError,
}: {
  report: QualityReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading quality improvement report…</p>;
  }

  if (isError || report == null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Quality improvement report unavailable for this workspace.
      </p>
    );
  }

  const insufficient = report.status === "insufficient_sample";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Quality improvement report
        </h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Compares targeted visual failure frequency before vs after accepted calibration changes.
        </p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label="Status" value={report.status} />
        <MetadataRow label="Rubric version" value={report.rubricCalibrationVersion} />
        <MetadataRow
          label="Accepted adjustments"
          value={String(report.acceptedAdjustments.length)}
        />
        {report.fixtureMetrics ? (
          <>
            <MetadataRow
              label="Fixture pass (after)"
              value={formatRate(report.fixtureMetrics.targetedArchetypePassRateAfter)}
            />
            <MetadataRow label="Evidence source" value="fixture" />
          </>
        ) : null}
      </dl>

      {insufficient ? (
        <SampleGuidanceList
          guidance={report.sampleGuidance}
          fallback="Sample size is insufficient to claim targeted failure-frequency improvement. Delta rates are withheld until the post-change corpus arm has enough human evaluations."
        />
      ) : null}

      {report.acceptedAdjustments.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Accepted adjustments
          </h4>
          <ul className="space-y-1 text-xs text-[var(--text-primary)]">
            {report.acceptedAdjustments.map((adjustment) => (
              <li key={adjustment.adjustmentId} className="font-mono text-[11px]">
                {adjustment.targetModule}/{adjustment.targetKey} ·{" "}
                {adjustment.adjustmentId.slice(0, 8)}…
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Visual failure frequency (targeted reasons)
        </h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Reason</th>
                <th className="px-2 py-1.5 text-right font-medium">Before count</th>
                <th className="px-2 py-1.5 text-right font-medium">Before rate</th>
                <th className="px-2 py-1.5 text-right font-medium">After count</th>
                <th className="px-2 py-1.5 text-right font-medium">After rate</th>
                <th className="px-2 py-1.5 text-right font-medium">Δ rate</th>
              </tr>
            </thead>
            <tbody>
              {report.targetedFailureReasons.map((reason) => {
                const before = report.visualMetrics.failureFrequencyBefore[reason];
                const after = report.visualMetrics.failureFrequencyAfter[reason];
                const delta = report.visualMetrics.deltaRateByReason[reason];
                return (
                  <tr key={reason} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5 text-[var(--text-primary)]">
                      {FAILURE_REASON_LABELS[reason]}
                    </td>
                    <td className="px-2 py-1.5 text-right">{before?.count ?? 0}</td>
                    <td className="px-2 py-1.5 text-right">{formatRate(before?.rate ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">{after?.count ?? 0}</td>
                    <td className="px-2 py-1.5 text-right">{formatRate(after?.rate ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {insufficient || delta == null ? "—" : formatSignedDelta(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {report.fixtureMetrics ? (
        <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Fixture gate detection
          </h4>
          <dl className="space-y-1.5">
            <MetadataRow
              label="Targeted archetype pass (before)"
              value={formatRate(report.fixtureMetrics.targetedArchetypePassRateBefore)}
            />
            <MetadataRow
              label="Targeted archetype pass (after)"
              value={formatRate(report.fixtureMetrics.targetedArchetypePassRateAfter)}
            />
          </dl>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Factual pass rates (separate from visual)
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label="Before arm factual pass rate"
            value={formatRate(report.factualMetrics.factualPassRateBefore)}
          />
          <MetadataRow
            label="After arm factual pass rate"
            value={formatRate(report.factualMetrics.factualPassRateAfter)}
          />
        </dl>
      </div>
    </div>
  );
}

function CalibrationTabContent({
  report,
  isLoading,
  isError,
}: {
  report: CalibrationReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [fixtureAcknowledged, setFixtureAcknowledged] = useState<Record<string, boolean>>({});

  const acceptMutation = useMutation({
    mutationFn: async ({
      adjustmentId,
      acknowledgeFixtureOnly,
    }: {
      adjustmentId: string;
      acknowledgeFixtureOnly?: boolean;
    }) => {
      const init: RequestInit = { method: "PATCH" };
      if (acknowledgeFixtureOnly) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify({ acknowledgeFixtureOnly: true });
      }
      const res = await apiFetch(
        `/api/feedback/calibration-adjustments/${adjustmentId}/accept`,
        init
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Accept failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["score-calibration"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({
      adjustmentId,
      reason,
    }: {
      adjustmentId: string;
      reason: string;
    }) => {
      const res = await apiFetch(
        `/api/feedback/calibration-adjustments/${adjustmentId}/reject`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Reject failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["score-calibration"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const handleReject = (adjustmentId: string) => {
    const reason = window.prompt("Rejection reason (required):");
    if (!reason?.trim()) return;
    rejectMutation.mutate({ adjustmentId, reason: reason.trim() });
  };

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading calibration report…</p>;
  }

  if (isError || report == null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Calibration report unavailable for this workspace.
      </p>
    );
  }

  const insufficient = report.status === "insufficient_corpus";
  const busyAdjustmentId =
    acceptMutation.isPending
      ? acceptMutation.variables?.adjustmentId
      : rejectMutation.isPending
        ? rejectMutation.variables?.adjustmentId
        : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Calibration report</h3>
        <p className="text-xs text-[var(--text-secondary)]">{report.snapshotCapturedAtNote}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label="Status" value={report.status} />
        <MetadataRow label="Evaluated items" value={String(report.evaluatedItemCount)} />
        <MetadataRow
          label="Visual MAE"
          value={formatNullableNumber(report.visualMetrics.meanAbsError)}
        />
        <MetadataRow
          label="Signed bias"
          value={formatSignedDelta(report.visualMetrics.meanSignedDelta)}
        />
      </dl>

      {insufficient ? (
        <SampleGuidanceList
          guidance={report.sampleGuidance}
          fallback={`At least ${report.evaluatedItemCount} evaluated corpus items are in scope. Calibration aggregates are withheld until the global minimum is met. Factual metrics below reflect available evaluations only.`}
        />
      ) : null}

      {!insufficient ? (
        <>
          <SliceTable
            title="Divergence by failure reason"
            slices={report.visualMetrics.divergenceByFailureReason}
          />
          <SliceTable title="Divergence by mode" slices={report.visualMetrics.divergenceByMode} />
          <SliceTable title="Divergence by format" slices={report.visualMetrics.divergenceByFormat} />
        </>
      ) : null}

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Factual metrics
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label="Factual pass rate"
            value={
              report.factualMetrics.factualPassRate == null
                ? "—"
                : `${(report.factualMetrics.factualPassRate * 100).toFixed(0)}%`
            }
          />
          <MetadataRow
            label="Factual fail count"
            value={String(report.factualMetrics.factualFailCount)}
          />
          <MetadataRow
            label="High visual but factual fail"
            value={String(report.factualMetrics.highVisualButFactualFail.length)}
          />
        </dl>
      </div>

      {report.adjustments.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Proposed adjustments
          </h4>
          {actionError ? (
            <p className="text-xs text-rose-400">{actionError}</p>
          ) : null}
          <ul className="space-y-2 text-xs text-[var(--text-primary)]">
            {report.adjustments.map((adjustment) => {
              const evidenceRefs = adjustment.evidenceRefs;
              const isCrossClient = evidenceRefs?.promotionSource === "cross_client";
              const isFixtureOnly = evidenceRefs?.fixtureOnly === true;
              const supportingRuleIds = evidenceRefs?.supportingClientRuleIds ?? [];
              const acked = adjustment.id
                ? fixtureAcknowledged[adjustment.id] === true
                : false;
              const acceptDisabled =
                !adjustment.id ||
                busyAdjustmentId === adjustment.id ||
                (isFixtureOnly && !acked);

              return (
                <li
                  key={
                    adjustment.id ??
                    `${adjustment.targetModule}:${adjustment.targetKey}:${adjustment.adjustmentVersion}`
                  }
                  className="space-y-2 rounded-md border border-[var(--border-dim)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isCrossClient ? (
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-200">
                        Cross-client
                      </span>
                    ) : null}
                    <span>
                      {adjustment.targetModule} · {adjustment.targetKey} · v
                      {adjustment.adjustmentVersion} · {adjustment.evidenceCount} items ·{" "}
                      {adjustment.status}
                    </span>
                  </div>

                  {isCrossClient && supportingRuleIds.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {supportingRuleIds.length} supporting client rules
                      </p>
                      <ul className="flex flex-wrap gap-1">
                        {supportingRuleIds.map((ruleId) => (
                          <li
                            key={ruleId}
                            className="rounded border border-[var(--border-dim)] bg-[var(--surface-base)] px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {ruleId}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {isFixtureOnly ? (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
                      This proposal uses only fixture evidence — acknowledge before accepting.
                    </p>
                  ) : null}

                  {adjustment.status === "proposed" && adjustment.id ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {isFixtureOnly ? (
                        <label className="flex items-start gap-2 text-[10px] text-amber-200/90">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            aria-label="I acknowledge this proposal uses only fixture evidence"
                            checked={acked}
                            onChange={(event) =>
                              setFixtureAcknowledged((prev) => ({
                                ...prev,
                                [adjustment.id!]: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            Reconheço que esta proposta usa apenas evidência de fixture
                          </span>
                        </label>
                      ) : (
                        <span />
                      )}
                      <div className="inline-flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={acceptDisabled}
                          onClick={() =>
                            acceptMutation.mutate({
                              adjustmentId: adjustment.id!,
                              acknowledgeFixtureOnly: isFixtureOnly ? true : undefined,
                            })
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyAdjustmentId === adjustment.id}
                          onClick={() => handleReject(adjustment.id!)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {report.visualMetrics.comparisons.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Per-item comparison
            </h4>
            {report.truncated ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                Showing {report.visualMetrics.comparisons.length} of{" "}
                {report.totalComparisonCount ?? report.visualMetrics.comparisons.length}
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Auto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Human</th>
                  <th className="px-2 py-1.5 text-right font-medium">Delta</th>
                  <th className="px-2 py-1.5 text-left font-medium">Failure reason</th>
                  <th className="px-2 py-1.5 text-left font-medium">Factual</th>
                </tr>
              </thead>
              <tbody>
                {report.visualMetrics.comparisons.map((comparison) => (
                  <tr
                    key={comparison.corpusItemId}
                    className="border-t border-[var(--border-dim)]"
                  >
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {comparison.corpusItemId.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {comparison.automaticQualityScore ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">{comparison.humanVisualScore}</td>
                    <td className="px-2 py-1.5 text-right">
                      {formatSignedDelta(comparison.scoreDelta)}
                    </td>
                    <td className="px-2 py-1.5">{comparison.primaryFailureReason}</td>
                    <td className="px-2 py-1.5">
                      {comparison.factualPass ? "pass" : "fail"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TrendTabContent({
  report,
  isLoading,
  isError,
  cohortFilter,
  onCohortChange,
  trendFilters,
  onTrendFiltersChange,
  selectedBucketKey,
  onSelectedBucketChange,
}: {
  report: QualityTrendReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
  cohortFilter: HumanQualityCorpusCohort | "";
  onCohortChange: (value: HumanQualityCorpusCohort | "") => void;
  trendFilters: TrendDimensionFilters;
  onTrendFiltersChange: (filters: TrendDimensionFilters) => void;
  selectedBucketKey: string;
  onSelectedBucketChange: (bucketKey: string) => void;
}) {
  const chartData = useMemo(() => {
    if (!report?.buckets) return [];
    return [...report.buckets]
      .sort((a, b) => a.bucketKey.localeCompare(b.bucketKey))
      .map((bucket) => ({
        bucketKey: bucket.bucketKey,
        meanHumanVisualScore: bucket.meanHumanVisualScore,
        factualPassRatePct:
          bucket.factualPassRate != null ? bucket.factualPassRate * 100 : null,
        learningImpactStatus: bucket.learningImpactStatus,
        count: bucket.count,
      }));
  }, [report]);

  const selectedBucket = useMemo(() => {
    if (!report || !selectedBucketKey) return null;
    return report.buckets.find((b) => b.bucketKey === selectedBucketKey) ?? null;
  }, [report, selectedBucketKey]);

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading quality trend report…</p>;
  }

  if (isError || report == null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Quality trend report unavailable for this workspace.
      </p>
    );
  }

  const insufficient = report.status === "insufficient_sample";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Quality trend</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Live human visual scores and factual pass rates over ISO weeks — not fixture metrics.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Cohort filter</span>
          <select
            value={cohortFilter}
            onChange={(e) => onCohortChange(e.target.value as HumanQualityCorpusCohort | "")}
            aria-label="Cohort filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">All cohorts</option>
            {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
              <option key={cohort} value={cohort}>
                {cohort}
              </option>
            ))}
          </select>
        </label>

        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Generation mode</span>
          <select
            value={trendFilters.generationMode}
            onChange={(e) =>
              onTrendFiltersChange({ ...trendFilters, generationMode: e.target.value })
            }
            aria-label="Trend generation mode filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">All modes</option>
            {TREND_GENERATION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>

        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Format</span>
          <select
            value={trendFilters.format}
            onChange={(e) => onTrendFiltersChange({ ...trendFilters, format: e.target.value })}
            aria-label="Trend format filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">All formats</option>
            {TREND_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-[12rem] flex-1 gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Client profile ID</span>
          <input
            value={trendFilters.clientProfileId}
            onChange={(e) =>
              onTrendFiltersChange({ ...trendFilters, clientProfileId: e.target.value })
            }
            placeholder="UUID (optional)"
            aria-label="Trend client profile ID filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-[11px]"
          />
        </label>

        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Primary failure reason</span>
          <select
            value={trendFilters.primaryFailureReason}
            onChange={(e) =>
              onTrendFiltersChange({
                ...trendFilters,
                primaryFailureReason: e.target.value as HumanQualityFailureReason | "",
              })
            }
            aria-label="Trend primary failure reason filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">All reasons</option>
            {HUMAN_QUALITY_FAILURE_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {FAILURE_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label="Status" value={report.status} />
        <MetadataRow label="Evaluated items" value={String(report.evaluatedItemCount)} />
        <MetadataRow label="Populated buckets" value={String(report.populatedBucketCount)} />
        <MetadataRow label="Evidence source" value={report.evidenceSource} />
        <MetadataRow
          label="Latest evaluated"
          value={
            report.latestEvaluatedAt
              ? new Date(report.latestEvaluatedAt).toLocaleString()
              : "—"
          }
        />
      </dl>

      {report.truncated ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
          Trend report truncated at row limit — aggregates may omit recent evaluations.
        </p>
      ) : null}

      {report.alertFlags.insufficientCoverage ? (
        <div
          className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
          data-testid="trend-alert-insufficient-coverage"
        >
          <p className="text-xs font-medium text-amber-100">Insufficient coverage</p>
          {report.alertFlags.reasons?.insufficientCoverage ? (
            <p className="text-xs text-amber-100/90">{report.alertFlags.reasons.insufficientCoverage}</p>
          ) : null}
          <SampleGuidanceList
            guidance={report.sampleGuidance}
            fallback="Sample size is insufficient for reliable trend direction. Evaluate more corpus items before interpreting movement."
          />
        </div>
      ) : null}

      {report.alertFlags.staleEvidence ? (
        <p
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-100"
          data-testid="trend-alert-stale-evidence"
        >
          Corpus refreshed — re-run evidence CLI
          {report.alertFlags.reasons?.staleEvidence
            ? ` · ${report.alertFlags.reasons.staleEvidence}`
            : ""}
        </p>
      ) : null}

      {report.alertFlags.regressionDetected ? (
        <p
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
          data-testid="trend-alert-regression"
        >
          Regression detected
          {report.alertFlags.reasons?.regressionDetected
            ? `: ${report.alertFlags.reasons.regressionDetected}`
            : ""}
        </p>
      ) : null}

      {insufficient ? (
        <SampleGuidanceList
          guidance={report.sampleGuidance}
          fallback="Sample size is insufficient to claim quality trend direction. Chart shows available data only — no directional improvement claims."
        />
      ) : null}

      {chartData.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Weekly metrics
          </h4>
          <div className="h-[280px] min-h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={280} minWidth={0}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                onClick={(state) => {
                  const label = (state as { activeLabel?: string }).activeLabel;
                  if (label) {
                    onSelectedBucketChange(label);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
                <XAxis
                  dataKey="bucketKey"
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border-dim)" }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="visual"
                  domain={[0, 100]}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "Visual score",
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--text-muted)",
                    fontSize: 10,
                  }}
                />
                <YAxis
                  yAxisId="factual"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "Factual pass %",
                    angle: 90,
                    position: "insideRight",
                    fill: "var(--text-muted)",
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "var(--text-primary)" }}
                  itemStyle={{ color: "var(--text-secondary)" }}
                  formatter={(value, name) => {
                    if (name === "factualPassRatePct" && typeof value === "number") {
                      return [`${value.toFixed(0)}%`, "Factual pass rate"];
                    }
                    if (name === "meanHumanVisualScore" && typeof value === "number") {
                      return [value.toFixed(1), "Mean visual score"];
                    }
                    return [value ?? "—", String(name)];
                  }}
                />
                <Line
                  yAxisId="visual"
                  type="monotone"
                  dataKey="meanHumanVisualScore"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ r: 4, cursor: "pointer" }}
                  connectNulls
                />
                <Line
                  yAxisId="factual"
                  type="monotone"
                  dataKey="factualPassRatePct"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  dot={{ r: 4, cursor: "pointer" }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2">
            {chartData.map((point) => (
              <span
                key={point.bucketKey}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                  point.learningImpactStatus === "ok"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                }`}
              >
                {point.bucketKey}: Learning impact comparability{" "}
                {point.learningImpactStatus === "ok" ? "ok" : "insufficient_sample"} (n=
                {point.count})
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">No populated time buckets yet.</p>
      )}

      {report.buckets.length > 0 ? (
        <label className="grid max-w-md gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Evidence bucket</span>
          <select
            value={selectedBucketKey}
            onChange={(e) => onSelectedBucketChange(e.target.value)}
            aria-label="Trend evidence bucket"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-[11px]"
          >
            <option value="">Select ISO week bucket…</option>
            {[...report.buckets]
              .sort((a, b) => a.bucketKey.localeCompare(b.bucketKey))
              .map((bucket) => (
                <option key={bucket.bucketKey} value={bucket.bucketKey}>
                  {bucket.bucketKey} (n={bucket.count})
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {selectedBucket?.evidenceRefs?.itemRefs &&
      selectedBucket.evidenceRefs.itemRefs.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Bucket evidence ({selectedBucket.bucketKey})
            </h4>
            {selectedBucket.evidenceRefs.truncated ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                Showing {selectedBucket.evidenceRefs.itemRefs.length} of{" "}
                {selectedBucket.evidenceRefs.totalCount}
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Visual</th>
                  <th className="px-2 py-1.5 text-left font-medium">Factual</th>
                  <th className="px-2 py-1.5 text-left font-medium">Evaluated</th>
                </tr>
              </thead>
              <tbody>
                {selectedBucket.evidenceRefs.itemRefs.map((row) => (
                  <tr key={row.corpusItemId} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {row.corpusItemId.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-1.5 text-right">{row.visualScore}</td>
                    <td className="px-2 py-1.5">{row.factualPass ? "pass" : "fail"}</td>
                    <td className="px-2 py-1.5">
                      {new Date(row.evaluatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedBucketKey ? (
        <p className="text-xs text-[var(--text-muted)]">
          No evidence rows for this bucket in the current filter scope.
        </p>
      ) : null}
    </div>
  );
}

function CandidatesTabContent({
  items,
  isLoading,
  isError,
  promoteCohort,
  onPromoteCohortChange,
  promotingId,
  onPromote,
}: {
  items: CorpusCandidateListResponse["items"];
  isLoading: boolean;
  isError: boolean;
  promoteCohort: HumanQualityCorpusCohort;
  onPromoteCohortChange: (cohort: HumanQualityCorpusCohort) => void;
  promotingId: string | null;
  onPromote: (candidateId: string) => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading captured candidates…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Candidate list unavailable for this scope.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
        No unpromoted candidates yet. Completed derivations are captured automatically after
        quality-gate — check back after new creatives finish generating.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Promote into cohort</span>
          <select
            value={promoteCohort}
            onChange={(e) => onPromoteCohortChange(e.target.value as HumanQualityCorpusCohort)}
            aria-label="Promote cohort"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
              <option key={cohort} value={cohort}>
                {cohort}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--text-secondary)]">{items.length} unpromoted candidate(s)</p>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
        <table className="min-w-full text-xs">
          <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Preview</th>
              <th className="px-2 py-1.5 text-left font-medium">Mode / format</th>
              <th className="px-2 py-1.5 text-left font-medium">Source</th>
              <th className="px-2 py-1.5 text-left font-medium">Workspace</th>
              <th className="px-2 py-1.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border-dim)]">
                <td className="px-2 py-1.5">
                  {item.previewImageUrl ? (
                    <div className="relative h-12 w-12 overflow-hidden rounded border border-[var(--border-dim)]">
                      <Image
                        src={item.previewImageUrl}
                        alt="Candidate preview"
                        fill
                        sizes="48px"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-primary)]">
                  {item.generationMode} · {item.format || "—"} · v{item.corpusVersion}
                </td>
                <td className="px-2 py-1.5">{item.sourceLabel}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {item.workspaceId.slice(0, 8)}…
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Button
                    type="button"
                    size="sm"
                    disabled={promotingId === item.id}
                    onClick={() => onPromote(item.id)}
                  >
                    {promotingId === item.id ? "Promoting…" : "Promote"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageTabContent({
  report,
  globalEvidence,
  isLoading,
  isError,
}: {
  report: SampleCoverageReportResponse | null | undefined;
  globalEvidence?: GlobalCorpusEvidenceResponse | null;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading sample coverage report…</p>;
  }

  if (isError || report == null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Sample coverage report unavailable for this scope.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {globalEvidence ? (
        <div className="space-y-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Global evidence</h3>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetadataRow
              label="Operational status"
              value={globalEvidence.operationalStatus}
            />
            <MetadataRow
              label="Pending items"
              value={String(globalEvidence.pendingItemCount)}
            />
            <MetadataRow
              label="Fixture only"
              value={globalEvidence.fixtureOnly ? "yes" : "no"}
            />
            <MetadataRow
              label="Source mix"
              value={`real ${globalEvidence.sourceComposition.real_customer} · synth ${globalEvidence.sourceComposition.synthetic_fixture} · op ${globalEvidence.sourceComposition.operator_imported}`}
            />
          </dl>
          {globalEvidence.withheldClaims.length > 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Withheld claims: {globalEvidence.withheldClaims.join("; ")}
            </p>
          ) : null}
          {globalEvidence.dependsOnOperator.length > 0 ? (
            <p className="text-xs text-amber-400">{globalEvidence.dependsOnOperator[0]}</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sample coverage</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Cross-gate rollup of which slices need more evaluations before stronger release claims.
        </p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <MetadataRow label="Evaluated items" value={String(report.evaluatedItemCount)} />
        <MetadataRow label="Next gate" value={report.nextGate} />
        <MetadataRow label="Captured" value={new Date(report.capturedAt).toLocaleString()} />
      </dl>

      <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]">
        {report.nextOperatorAction}
      </p>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Gate status
        </h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Gate</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
                <th className="px-2 py-1.5 text-left font-medium">Blocked claims</th>
              </tr>
            </thead>
            <tbody>
              {report.gates.map((gate) => (
                <tr key={gate.id} className="border-t border-[var(--border-dim)]">
                  <td className="px-2 py-1.5 text-[var(--text-primary)]">{gate.id}</td>
                  <td className="px-2 py-1.5">{gate.status}</td>
                  <td className="px-2 py-1.5 text-[var(--text-muted)]">
                    {gate.blockedClaims.length > 0 ? gate.blockedClaims.join("; ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {report.sliceGaps.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Slice gaps
          </h4>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Gate</th>
                  <th className="px-2 py-1.5 text-left font-medium">Slice / dimension</th>
                  <th className="px-2 py-1.5 text-left font-medium">Arm</th>
                  <th className="px-2 py-1.5 text-right font-medium">Need</th>
                  <th className="px-2 py-1.5 text-left font-medium">Blocked claim</th>
                </tr>
              </thead>
              <tbody>
                {report.sliceGaps.map((gap) => (
                  <tr key={guidanceItemKey(gap)} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5">{gap.gate}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {gap.sliceKey ?? gap.dimension ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">{gap.arm ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{gap.additionalNeeded}</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">{gap.blockedClaim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          No slice gaps — all sampling gates satisfied for this snapshot.
        </p>
      )}
    </div>
  );
}

type ScopedQualityTaskProps = {
  corpusScope: CorpusScope;
  workspaceId: string;
};

type CohortQualityTaskProps = ScopedQualityTaskProps & {
  cohortFilter: HumanQualityCorpusCohort | "";
};

function scopedWorkspaceId({ corpusScope, workspaceId }: ScopedQualityTaskProps) {
  return corpusScope === "workspace" ? workspaceId : undefined;
}

function CalibrationTask(props: CohortQualityTaskProps) {
  const query = useQuery({
    queryKey: ["score-calibration", props.corpusScope, props.workspaceId, props.cohortFilter],
    queryFn: () => fetchCalibrationReport(scopedWorkspaceId(props), props.cohortFilter),
    retry: false,
  });

  return (
    <CalibrationTabContent
      report={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
    />
  );
}

function ImpactTask(props: CohortQualityTaskProps) {
  const query = useQuery({
    queryKey: ["learning-impact", props.corpusScope, props.workspaceId, props.cohortFilter],
    queryFn: () => fetchLearningImpactReport(scopedWorkspaceId(props), props.cohortFilter),
    retry: false,
  });

  return <ImpactReportView report={query.data} isLoading={query.isLoading} isError={query.isError} />;
}

function QualityTask(props: CohortQualityTaskProps) {
  const query = useQuery({
    queryKey: ["quality-improvement", props.corpusScope, props.workspaceId, props.cohortFilter],
    queryFn: () => fetchQualityImprovementReport(scopedWorkspaceId(props), props.cohortFilter),
    retry: false,
  });

  return (
    <QualityImprovementReportView
      report={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
    />
  );
}

function CoverageTask(props: CohortQualityTaskProps) {
  const coverageQuery = useQuery({
    queryKey: ["sample-coverage", props.corpusScope, props.workspaceId, props.cohortFilter],
    queryFn: () => fetchSampleCoverage(scopedWorkspaceId(props), props.cohortFilter),
    retry: false,
  });
  const globalEvidenceQuery = useQuery({
    queryKey: ["global-corpus-evidence", props.cohortFilter],
    queryFn: () => fetchGlobalCorpusEvidence(props.cohortFilter),
    enabled: props.corpusScope === "global",
    retry: false,
  });

  return (
    <CoverageTabContent
      report={coverageQuery.data}
      globalEvidence={globalEvidenceQuery.data}
      isLoading={coverageQuery.isLoading || globalEvidenceQuery.isLoading}
      isError={coverageQuery.isError}
    />
  );
}

function TrendTask(props: ScopedQualityTaskProps) {
  const [cohortFilter, setCohortFilter] = useState<HumanQualityCorpusCohort | "">("");
  const [trendFilters, setTrendFilters] = useState<TrendDimensionFilters>({
    generationMode: "",
    format: "",
    clientProfileId: "",
    primaryFailureReason: "",
  });
  const [selectedBucketKey, setSelectedBucketKey] = useState("");
  const query = useQuery({
    queryKey: [
      "quality-trend",
      props.corpusScope,
      props.workspaceId,
      cohortFilter,
      trendFilters.generationMode,
      trendFilters.format,
      trendFilters.clientProfileId,
      trendFilters.primaryFailureReason,
    ],
    queryFn: () =>
      fetchQualityTrendReport(scopedWorkspaceId(props), cohortFilter, trendFilters),
    retry: false,
  });

  return (
    <TrendTabContent
      report={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      cohortFilter={cohortFilter}
      onCohortChange={setCohortFilter}
      trendFilters={trendFilters}
      onTrendFiltersChange={setTrendFilters}
      selectedBucketKey={selectedBucketKey}
      onSelectedBucketChange={setSelectedBucketKey}
    />
  );
}

function CandidatesTask(props: ScopedQualityTaskProps) {
  const queryClient = useQueryClient();
  const [promoteCohort, setPromoteCohort] = useState<HumanQualityCorpusCohort>("baseline");
  const [promotingCandidateId, setPromotingCandidateId] = useState<string | null>(null);
  const candidatesQuery = useQuery({
    queryKey: ["corpus-candidates", props.corpusScope, props.workspaceId],
    queryFn: () => fetchCorpusCandidates(scopedWorkspaceId(props)),
    retry: false,
  });
  const promoteCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await apiFetch(
        `/api/feedback/human-quality-corpus/candidates/${candidateId}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: promoteCohort }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Promote failed");
      }
      return res.json();
    },
    onMutate: setPromotingCandidateId,
    onSettled: () => setPromotingCandidateId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["corpus-candidates"] });
      void queryClient.invalidateQueries({
        queryKey: ["human-quality-corpus-queue", props.corpusScope, props.workspaceId],
      });
    },
  });

  return (
    <CandidatesTabContent
      items={candidatesQuery.data?.items ?? []}
      isLoading={candidatesQuery.isLoading}
      isError={candidatesQuery.isError}
      promoteCohort={promoteCohort}
      onPromoteCohortChange={setPromoteCohort}
      promotingId={promotingCandidateId}
      onPromote={(candidateId) => promoteCandidateMutation.mutate(candidateId)}
    />
  );
}

export function HumanQualityCorpusPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");
  const [corpusScope, setCorpusScope] = useState<CorpusScope>("global");
  const [workspaceId, setWorkspaceId] = useState("");
  const [queueFilters, setQueueFilters] = useState<CorpusQueueFilterState>(DEFAULT_QUEUE_FILTERS);
  const [cohortFilter, setCohortFilter] = useState<HumanQualityCorpusCohort | "">("");
  const [visualScore, setVisualScore] = useState("");
  const [factualPass, setFactualPass] = useState("");
  const [intent, setIntent] = useState("");
  const [primaryFailureReason, setPrimaryFailureReason] = useState("");
  const [otherReasonText, setOtherReasonText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: [
      "human-quality-corpus-queue",
      corpusScope,
      workspaceId,
      queueFilters.cohort,
      queueFilters.generationMode,
      queueFilters.format,
      queueFilters.sourceLabel,
      queueFilters.clientProfileId,
      queueFilters.status,
    ],
    queryFn: () =>
      fetchPendingQueue(
        corpusScope === "workspace" ? workspaceId : undefined,
        queueFilters
      ),
    enabled:
      activeTab === "queue" &&
      (corpusScope === "global" || Boolean(workspaceId)),
    retry: false,
  });

  const scopedWorkspaceId = corpusScope === "workspace" ? workspaceId : undefined;

  const queueItems = queueQuery.data?.items ?? [];
  const queueProgress = queueQuery.data?.progress ?? null;
  const currentItem = queueItems[0] ?? null;
  const pendingCount = queueProgress?.totalPending ?? queueItems.length;

  const resetForm = () => {
    setVisualScore("");
    setFactualPass("");
    setIntent("");
    setPrimaryFailureReason("");
    setOtherReasonText("");
    setNotes("");
    setSubmitError(null);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentItem) throw new Error("missing item");
      if (corpusScope === "workspace" && !workspaceId) throw new Error("missing workspace");
      const parsedScore = Number(visualScore);
      if (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 100) {
        throw new Error("Visual score must be an integer from 0 to 100");
      }
      if (factualPass !== "true" && factualPass !== "false") {
        throw new Error("Factual pass is required");
      }
      if (!HUMAN_QUALITY_INTENTS.includes(intent as HumanQualityIntent)) {
        throw new Error("Reviewer intent is required");
      }
      if (
        !HUMAN_QUALITY_FAILURE_REASONS.includes(primaryFailureReason as HumanQualityFailureReason)
      ) {
        throw new Error("Primary failure reason is required");
      }
      if (primaryFailureReason === "other" && !otherReasonText.trim()) {
        throw new Error("Describe the other failure reason");
      }

      const evaluationBody = buildEvaluationPayload({
        workspaceId: corpusScope === "workspace" ? workspaceId : undefined,
        visualScore: parsedScore,
        factualPass: factualPass === "true",
        intent: intent as HumanQualityIntent,
        primaryFailureReason: primaryFailureReason as HumanQualityFailureReason,
        otherReasonText: primaryFailureReason === "other" ? otherReasonText.trim() : null,
        notes: notes.trim() || null,
      });

      for (const key of FORBIDDEN_EVALUATION_PAYLOAD_KEYS) {
        if (key in evaluationBody) {
          throw new Error(`Unsafe evaluation payload key: ${key}`);
        }
      }

      const res = await apiFetch(
        `/api/feedback/human-quality-corpus/${currentItem.id}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(evaluationBody),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Evaluation failed");
      }
      const payload = (await res.json()) as {
        item?: unknown;
        evaluation?: unknown;
        decisionEvidence?: unknown;
      };
      return payload;
    },
    onSuccess: () => {
      resetForm();
      void queryClient.invalidateQueries({
        queryKey: [
          "human-quality-corpus-queue",
          corpusScope,
          workspaceId,
          queueFilters.cohort,
          queueFilters.generationMode,
          queueFilters.format,
          queueFilters.sourceLabel,
          queueFilters.clientProfileId,
          queueFilters.status,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ["score-calibration"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["learning-impact"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["quality-improvement"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sample-coverage"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["quality-trend"],
      });
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  const formValid = useMemo(() => {
    const parsedScore = Number(visualScore);
    const scoreOk = Number.isInteger(parsedScore) && parsedScore >= 0 && parsedScore <= 100;
    const factualOk = factualPass === "true" || factualPass === "false";
    const intentOk = HUMAN_QUALITY_INTENTS.includes(intent as HumanQualityIntent);
    const reasonOk = HUMAN_QUALITY_FAILURE_REASONS.includes(
      primaryFailureReason as HumanQualityFailureReason
    );
    const otherOk =
      primaryFailureReason !== "other" || otherReasonText.trim().length > 0;
    return scoreOk && factualOk && intentOk && reasonOk && otherOk;
  }, [visualScore, factualPass, intent, primaryFailureReason, otherReasonText]);

  const queueForbidden = queueQuery.isFetched && queueQuery.data === null;

  if (corpusScope === "global" && queueQuery.isFetched && queueForbidden) {
    return null;
  }

  const snapshot = currentItem?.qualitySnapshot;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Human quality corpus
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Internal evaluation queue, score calibration audit, learning impact, and quality
          improvement measurement.
        </p>
      </div>

      <CorpusIngestionBanner />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-primary)]">Corpus scope</span>
        <div
          className="inline-flex rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-0.5"
          role="group"
          aria-label="Corpus scope"
        >
          {(["global", "workspace"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              aria-pressed={corpusScope === scope}
              onClick={() => {
                setCorpusScope(scope);
                resetForm();
              }}
              className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                corpusScope === scope
                  ? "bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {scope}
            </button>
          ))}
        </div>
      </div>

      {corpusScope === "workspace" ? (
        <label className="grid max-w-md gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Workspace ID</span>
          <input
            value={workspaceId}
            onChange={(e) => {
              setWorkspaceId(e.target.value);
              resetForm();
            }}
            placeholder="Required to load scoped queue"
            aria-label="Workspace ID"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
      ) : null}

      {corpusScope === "workspace" && !workspaceId ? (
        <p className="text-sm text-[var(--text-muted)]">
          Enter a workspace ID to load a scoped corpus queue and calibration reports.
        </p>
      ) : (
        <>
          <ResponsiveTabs
            items={[...PANEL_TABS]}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as PanelTab)}
            ariaLabel="Human quality corpus views"
          />

          {activeTab === "calibration" ||
          activeTab === "impact" ||
          activeTab === "quality" ||
          activeTab === "coverage" ||
          activeTab === "trend" ? (
            <div className="space-y-3 pt-2">
              {activeTab !== "trend" ? (
                <label className="grid max-w-xs gap-1 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">Cohort filter</span>
                  <select
                    value={cohortFilter}
                    onChange={(e) =>
                      setCohortFilter(e.target.value as HumanQualityCorpusCohort | "")
                    }
                    aria-label="Cohort filter"
                    className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                  >
                    <option value="">All cohorts</option>
                    {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
                      <option key={cohort} value={cohort}>
                        {cohort}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {activeTab === "calibration" ? (
                <CalibrationTask
                  corpusScope={corpusScope}
                  workspaceId={workspaceId}
                  cohortFilter={cohortFilter}
                />
              ) : activeTab === "impact" ? (
                <ImpactTask
                  corpusScope={corpusScope}
                  workspaceId={workspaceId}
                  cohortFilter={cohortFilter}
                />
              ) : activeTab === "quality" ? (
                <QualityTask
                  corpusScope={corpusScope}
                  workspaceId={workspaceId}
                  cohortFilter={cohortFilter}
                />
              ) : activeTab === "coverage" ? (
                <CoverageTask
                  corpusScope={corpusScope}
                  workspaceId={workspaceId}
                  cohortFilter={cohortFilter}
                />
              ) : (
                <TrendTask corpusScope={corpusScope} workspaceId={workspaceId} />
              )}
            </div>
          ) : activeTab === "candidates" ? (
            <div className="space-y-3 pt-2">
              <CandidatesTask corpusScope={corpusScope} workspaceId={workspaceId} />
            </div>
          ) : activeTab === "learning" ? (
            <div className="space-y-6 pt-2">
              <FactualAlertsPanel workspaceId={scopedWorkspaceId} variant="workspace" />
              <LearningProposalsTab
                workspaceId={scopedWorkspaceId}
                onOpenCalibration={() => setActiveTab("calibration")}
              />
            </div>
          ) : queueForbidden ? (
            <p className="text-sm text-[var(--text-muted)]">
              Corpus evaluation queue is restricted to platform owners.
            </p>
          ) : queueQuery.isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading corpus queue…</p>
          ) : queueQuery.isError ? (
            <p className="text-sm text-[var(--text-muted)]">Unable to load corpus queue.</p>
          ) : (
            <div className="space-y-3 pt-2">
              {corpusScope === "global" ? (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid max-w-xs gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Status</span>
                    <select
                      value={queueFilters.status}
                      onChange={(e) =>
                        setQueueFilters({
                          ...queueFilters,
                          status: e.target.value as CorpusQueueFilterState["status"],
                        })
                      }
                      aria-label="Queue status filter"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                    >
                      <option value="pending">Pending</option>
                      <option value="evaluated">Evaluated</option>
                      <option value="removed">Removed</option>
                    </select>
                  </label>
                  <label className="grid max-w-xs gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Cohort</span>
                    <select
                      value={queueFilters.cohort}
                      onChange={(e) =>
                        setQueueFilters({
                          ...queueFilters,
                          cohort: e.target.value as HumanQualityCorpusCohort | "",
                        })
                      }
                      aria-label="Queue cohort filter"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                    >
                      <option value="">All cohorts</option>
                      {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
                        <option key={cohort} value={cohort}>
                          {cohort}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid max-w-xs gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Source</span>
                    <select
                      value={queueFilters.sourceLabel}
                      onChange={(e) =>
                        setQueueFilters({
                          ...queueFilters,
                          sourceLabel: e.target.value as HumanQualitySourceLabel | "",
                        })
                      }
                      aria-label="Queue source label filter"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                    >
                      <option value="">All sources</option>
                      {HUMAN_QUALITY_SOURCE_LABELS.map((label) => (
                        <option key={label} value={label}>
                          {formatHumanQualitySourceLabel(label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid max-w-xs gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Client profile</span>
                    <input
                      type="text"
                      value={queueFilters.clientProfileId}
                      onChange={(e) =>
                        setQueueFilters({ ...queueFilters, clientProfileId: e.target.value })
                      }
                      aria-label="Queue client profile ID filter"
                      placeholder="UUID (optional)"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-[11px]"
                    />
                  </label>
                  <label className="grid max-w-xs gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Mode</span>
                    <select
                      value={queueFilters.generationMode}
                      onChange={(e) =>
                        setQueueFilters({ ...queueFilters, generationMode: e.target.value })
                      }
                      aria-label="Queue generation mode filter"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                    >
                      <option value="">All modes</option>
                      {TREND_GENERATION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid max-w-xs gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Format</span>
                    <select
                      value={queueFilters.format}
                      onChange={(e) =>
                        setQueueFilters({ ...queueFilters, format: e.target.value })
                      }
                      aria-label="Queue format filter"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
                    >
                      <option value="">All formats</option>
                      {TREND_FORMATS.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {queueItems.length === 0 ? (
            <div className="space-y-3 pt-2">
              {queueProgress ? (
                <QueueProgressSummary
                  progress={queueProgress}
                  reviewPosition={0}
                  pendingInView={0}
                />
              ) : null}
              <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
                {corpusScope === "global"
                  ? "No pending global corpus items. Open the Candidates tab to promote captured creatives into a review cohort."
                  : "Queue is clear — no pending corpus items remain for review. Promote candidates or select new derivations from campaign review."}
              </p>
            </div>
          ) : currentItem && queueFilters.status === "pending" ? (
            <div className="space-y-4 pt-2">
              {queueProgress ? (
                <QueueProgressSummary
                  progress={queueProgress}
                  reviewPosition={1}
                  pendingInView={queueItems.length}
                />
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Current item
                  </p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {currentItem.generationMode} · {currentItem.format || "—"} ·{" "}
                    {currentItem.cohort} · v{currentItem.corpusVersion}
                  </p>
                </div>

                <div className="relative aspect-square w-full overflow-hidden rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)]">
                  {currentItem.previewImageUrl ? (
                    <Image
                      src={currentItem.previewImageUrl}
                      alt="Derivation preview"
                      fill
                      sizes="(max-width: 1024px) 100vw, 480px"
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-[var(--text-muted)]">
                      Preview unavailable
                    </div>
                  )}
                </div>

                <dl className="space-y-1.5">
                  <MetadataRow label="Workspace" value={currentItem.workspaceId.slice(0, 8) + "…"} />
                  <MetadataRow label="Campaign" value={currentItem.campaignId.slice(0, 8) + "…"} />
                  <MetadataRow
                    label="Derivation"
                    value={currentItem.derivationId.slice(0, 8) + "…"}
                  />
                  <MetadataRow label="Mode" value={currentItem.generationMode} />
                  <MetadataRow label="Format" value={currentItem.format || "—"} />
                  <MetadataRow label="Cohort" value={currentItem.cohort} />
                  {currentItem.clientProfileId ? (
                    <MetadataRow label="Client profile" value={currentItem.clientProfileId} />
                  ) : null}
                  {currentItem.sourceLabel ? (
                    <MetadataRow
                      label="Source"
                      value={formatHumanQualitySourceLabel(currentItem.sourceLabel)}
                    />
                  ) : null}
                  <MetadataRow label="Corpus version" value={`v${currentItem.corpusVersion}`} />
                  {snapshot?.qualityScore != null ? (
                    <MetadataRow label="Auto score" value={String(snapshot.qualityScore)} />
                  ) : null}
                  {snapshot?.qualityVerdict ? (
                    <MetadataRow label="Auto verdict" value={snapshot.qualityVerdict} />
                  ) : null}
                </dl>

                {currentItem.sourceLabel &&
                getHumanQualitySourceCaveat(currentItem.sourceLabel) ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200/90">
                    {getHumanQualitySourceCaveat(currentItem.sourceLabel)}
                  </p>
                ) : null}

                {snapshot?.hardFailures && snapshot.hardFailures.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Auto hard failures
                    </p>
                    <ul className="space-y-1 text-xs text-rose-300/90">
                      {snapshot.hardFailures.map((failure, index) => (
                        <li key={`${failure.code ?? "failure"}-${index}`}>
                          {failure.code ?? "failure"}
                          {failure.message ? ` — ${failure.message}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <form
                className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!formValid || submitMutation.isPending) return;
                  submitMutation.mutate();
                }}
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Human evaluation
                </h3>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">
                    Visual score (0–100)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={visualScore}
                    onChange={(e) => setVisualScore(e.target.value)}
                    aria-label="Visual score (0–100)"
                    className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
                  />
                </label>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">Factual pass</span>
                  <select
                    value={factualPass}
                    onChange={(e) => setFactualPass(e.target.value)}
                    aria-label="Factual pass"
                    className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
                  >
                    <option value="">Select…</option>
                    <option value="true">Pass</option>
                    <option value="false">Fail</option>
                  </select>
                </label>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">Reviewer intent</span>
                  <select
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    aria-label="Reviewer intent"
                    className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
                  >
                    <option value="">Select…</option>
                    {HUMAN_QUALITY_INTENTS.map((value) => (
                      <option key={value} value={value}>
                        {INTENT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">
                    Primary visible failure reason
                  </span>
                  <select
                    value={primaryFailureReason}
                    onChange={(e) => setPrimaryFailureReason(e.target.value)}
                    aria-label="Primary visible failure reason"
                    className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
                  >
                    <option value="">Select…</option>
                    {HUMAN_QUALITY_FAILURE_REASONS.map((value) => (
                      <option key={value} value={value}>
                        {FAILURE_REASON_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>

                {primaryFailureReason === "other" ? (
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Other reason</span>
                    <input
                      value={otherReasonText}
                      onChange={(e) => setOtherReasonText(e.target.value)}
                      aria-label="Other reason"
                      className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
                    />
                  </label>
                ) : null}

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">Notes (optional)</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    aria-label="Notes"
                    className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5"
                  />
                </label>

                {submitError ? (
                  <p className="text-xs text-rose-400">{submitError}</p>
                ) : null}

                <Button type="submit" disabled={!formValid || submitMutation.isPending}>
                  {submitMutation.isPending
                    ? "Submitting…"
                    : pendingCount > 1
                      ? "Submit & next"
                      : "Submit evaluation"}
                </Button>
              </form>
              </div>
            </div>
          ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
