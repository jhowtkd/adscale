"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ResponsiveTabs from "@/components/layout/ResponsiveTabs";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_FAILURE_REASONS,
  HUMAN_QUALITY_INTENTS,
  type HumanQualityCorpusCohort,
  type HumanQualityFailureReason,
  type HumanQualityIntent,
  type HumanQualityQualitySnapshot,
} from "@/server/human-quality/corpus";
import type { GroupSlice } from "@/server/human-quality/calibration/aggregate";
import type { CalibrationComparison } from "@/server/human-quality/calibration/types";
import type { AdjustmentProposalSummary } from "@/server/human-quality/calibration/report";
import type { SampleGuidance } from "@/server/human-quality/sampling/types";

type CorpusQueueItem = {
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
};

type CorpusStatusCount = {
  pending: number;
  evaluated: number;
};

type CorpusQueueProgress = {
  workspaceId: string;
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

const PANEL_TABS = [
  { id: "queue", label: "Queue" },
  { id: "calibration", label: "Calibration" },
  { id: "impact", label: "Impact" },
  { id: "quality", label: "Quality" },
  { id: "coverage", label: "Coverage" },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];

async function fetchPendingQueue(workspaceId: string): Promise<CorpusQueueResponse | null> {
  const params = new URLSearchParams({
    workspaceId,
    limit: "50",
    includeProgress: "true",
  });
  const res = await apiFetch(`/api/feedback/human-quality-corpus?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as CorpusQueueResponse;
}

async function fetchCalibrationReport(
  workspaceId: string,
  cohort: HumanQualityCorpusCohort | ""
): Promise<CalibrationReportResponse | null> {
  const params = new URLSearchParams({ workspaceId });
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/score-calibration?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: CalibrationReportResponse };
  return payload.report;
}

async function fetchLearningImpactReport(
  workspaceId: string,
  cohort: HumanQualityCorpusCohort | ""
): Promise<ImpactReportResponse | null> {
  const params = new URLSearchParams({ workspaceId });
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/learning-impact?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: ImpactReportResponse };
  return payload.report;
}

async function fetchQualityImprovementReport(
  workspaceId: string,
  cohort: HumanQualityCorpusCohort | ""
): Promise<QualityReportResponse | null> {
  const params = new URLSearchParams({ workspaceId });
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/quality-improvement?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: QualityReportResponse };
  return payload.report;
}

async function fetchSampleCoverage(
  workspaceId: string,
  cohort: HumanQualityCorpusCohort | ""
): Promise<SampleCoverageReportResponse | null> {
  const params = new URLSearchParams({ workspaceId });
  if (cohort) params.set("cohort", cohort);
  const res = await apiFetch(`/api/feedback/sample-coverage?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const payload = (await res.json()) as { report: SampleCoverageReportResponse };
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
  workspaceId: string;
  visualScore: number;
  factualPass: boolean;
  intent: HumanQualityIntent;
  primaryFailureReason: HumanQualityFailureReason;
  otherReasonText: string | null;
  notes: string | null;
}) {
  return {
    workspaceId: input.workspaceId,
    visualScore: input.visualScore,
    factualPass: input.factualPass,
    intent: input.intent,
    primaryFailureReason: input.primaryFailureReason,
    otherReasonText: input.otherReasonText,
    notes: input.notes,
  };
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
            Proposed adjustments (read-only)
          </h4>
          <ul className="space-y-1 text-xs text-[var(--text-primary)]">
            {report.adjustments.map((adjustment) => (
              <li
                key={`${adjustment.targetModule}:${adjustment.targetKey}:${adjustment.adjustmentVersion}`}
                className="rounded-md border border-[var(--border-dim)] px-2 py-1.5"
              >
                {adjustment.targetModule} · {adjustment.targetKey} · v
                {adjustment.adjustmentVersion} · {adjustment.evidenceCount} items ·{" "}
                {adjustment.status}
              </li>
            ))}
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

function CoverageTabContent({
  report,
  isLoading,
  isError,
}: {
  report: SampleCoverageReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading sample coverage report…</p>;
  }

  if (isError || report == null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Sample coverage report unavailable for this workspace.
      </p>
    );
  }

  return (
    <div className="space-y-4">
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

export function HumanQualityCorpusPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");
  const [workspaceId, setWorkspaceId] = useState("");
  const [cohortFilter, setCohortFilter] = useState<HumanQualityCorpusCohort | "">("");
  const [visualScore, setVisualScore] = useState("");
  const [factualPass, setFactualPass] = useState("");
  const [intent, setIntent] = useState("");
  const [primaryFailureReason, setPrimaryFailureReason] = useState("");
  const [otherReasonText, setOtherReasonText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: ["human-quality-corpus-queue", workspaceId],
    queryFn: () => fetchPendingQueue(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const calibrationQuery = useQuery({
    queryKey: ["score-calibration", workspaceId, cohortFilter],
    queryFn: () => fetchCalibrationReport(workspaceId, cohortFilter),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const impactQuery = useQuery({
    queryKey: ["learning-impact", workspaceId, cohortFilter],
    queryFn: () => fetchLearningImpactReport(workspaceId, cohortFilter),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const qualityQuery = useQuery({
    queryKey: ["quality-improvement", workspaceId, cohortFilter],
    queryFn: () => fetchQualityImprovementReport(workspaceId, cohortFilter),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const coverageQuery = useQuery({
    queryKey: ["sample-coverage", workspaceId, cohortFilter],
    queryFn: () => fetchSampleCoverage(workspaceId, cohortFilter),
    enabled: Boolean(workspaceId),
    retry: false,
  });

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
      if (!currentItem || !workspaceId) throw new Error("missing item");
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
        workspaceId,
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
      return res.json();
    },
    onSuccess: () => {
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["human-quality-corpus-queue", workspaceId] });
      void queryClient.invalidateQueries({
        queryKey: ["score-calibration", workspaceId, cohortFilter],
      });
      void queryClient.invalidateQueries({
        queryKey: ["learning-impact", workspaceId, cohortFilter],
      });
      void queryClient.invalidateQueries({
        queryKey: ["quality-improvement", workspaceId, cohortFilter],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sample-coverage", workspaceId, cohortFilter],
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
  const calibrationForbidden = calibrationQuery.isFetched && calibrationQuery.data === null;
  const impactForbidden = impactQuery.isFetched && impactQuery.data === null;
  const qualityForbidden = qualityQuery.isFetched && qualityQuery.data === null;
  const coverageForbidden = coverageQuery.isFetched && coverageQuery.data === null;

  if (
    workspaceId &&
    queueQuery.isFetched &&
    calibrationQuery.isFetched &&
    impactQuery.isFetched &&
    qualityQuery.isFetched &&
    coverageQuery.isFetched &&
    queueForbidden &&
    calibrationForbidden &&
    impactForbidden &&
    qualityForbidden &&
    coverageForbidden
  ) {
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

      <label className="grid max-w-md gap-1 text-xs">
        <span className="font-medium text-[var(--text-primary)]">Workspace ID</span>
        <input
          value={workspaceId}
          onChange={(e) => {
            setWorkspaceId(e.target.value);
            resetForm();
          }}
          placeholder="Required to load queue"
          aria-label="Workspace ID"
          className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
        />
      </label>

      {!workspaceId ? (
        <p className="text-sm text-[var(--text-muted)]">
          Enter a workspace ID to load pending corpus items and calibration report.
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
          activeTab === "coverage" ? (
            <div className="space-y-3 pt-2">
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
              {activeTab === "calibration" ? (
                <CalibrationTabContent
                  report={calibrationQuery.data}
                  isLoading={calibrationQuery.isLoading}
                  isError={calibrationQuery.isError}
                />
              ) : activeTab === "impact" ? (
                <ImpactReportView
                  report={impactQuery.data}
                  isLoading={impactQuery.isLoading}
                  isError={impactQuery.isError}
                />
              ) : activeTab === "quality" ? (
                <QualityImprovementReportView
                  report={qualityQuery.data}
                  isLoading={qualityQuery.isLoading}
                  isError={qualityQuery.isError}
                />
              ) : (
                <CoverageTabContent
                  report={coverageQuery.data}
                  isLoading={coverageQuery.isLoading}
                  isError={coverageQuery.isError}
                />
              )}
            </div>
          ) : queueForbidden ? (
            <p className="text-sm text-[var(--text-muted)]">
              Corpus evaluation queue is restricted to platform owners.
            </p>
          ) : queueQuery.isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading corpus queue…</p>
          ) : queueQuery.isError ? (
            <p className="text-sm text-[var(--text-muted)]">Unable to load corpus queue.</p>
          ) : queueItems.length === 0 ? (
            <div className="space-y-3 pt-2">
              {queueProgress ? (
                <QueueProgressSummary
                  progress={queueProgress}
                  reviewPosition={0}
                  pendingInView={0}
                />
              ) : null}
              <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
                Queue is clear — no pending corpus items remain for review. Select new derivations
                from campaign review to continue live corpus operations.
              </p>
            </div>
          ) : currentItem ? (
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
                  <MetadataRow label="Corpus version" value={`v${currentItem.corpusVersion}`} />
                  {snapshot?.qualityScore != null ? (
                    <MetadataRow label="Auto score" value={String(snapshot.qualityScore)} />
                  ) : null}
                  {snapshot?.qualityVerdict ? (
                    <MetadataRow label="Auto verdict" value={snapshot.qualityVerdict} />
                  ) : null}
                </dl>

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
        </>
      )}
    </section>
  );
}
