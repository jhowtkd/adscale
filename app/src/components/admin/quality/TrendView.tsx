"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_FAILURE_REASONS,
  type HumanQualityCorpusCohort,
  type HumanQualityFailureReason,
} from "@/server/human-quality/corpus";
import { useQualityContext } from "./quality-context";
import {
  fetchCalibrationReport,
  fetchLearningImpactReport,
  fetchQualityImprovementReport,
  fetchSampleCoverage,
  fetchGlobalCorpusEvidence,
  fetchQualityTrendReport,
  fetchCorpusCandidates,
  fetchPendingQueue,
  FORBIDDEN_EVALUATION_PAYLOAD_KEYS,
  FAILURE_REASON_LABELS,
  INTENT_LABELS,
  TREND_GENERATION_MODES,
  TREND_FORMATS,
  DEFAULT_QUEUE_FILTERS,
  buildEvaluationPayload,
  formatRate,
  formatSignedDelta,
  formatNullableNumber,
  MetadataRow,
  SampleGuidanceList,
  QueueProgressSummary,
  SliceTable,
  guidanceItemKey,
  type CalibrationReportResponse,
  type ImpactReportResponse,
  type QualityReportResponse,
  type SampleCoverageReportResponse,
  type GlobalCorpusEvidenceResponse,
  type QualityTrendReportResponse,
  type TrendDimensionFilters,
  type CorpusQueueFilterState,
  type CorpusCandidateListResponse,
} from "./corpus-shared";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);
const LineChart = dynamic(() => import("recharts").then((mod) => mod.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((mod) => mod.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false }
);

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

export function TrendView() {
  const { scope, workspaceId, cohort, setCohort } = useQualityContext();
  const [trendFilters, setTrendFilters] = useState<TrendDimensionFilters>({
    generationMode: "",
    format: "",
    clientProfileId: "",
    primaryFailureReason: "",
  });
  const [selectedTrendBucketKey, setSelectedTrendBucketKey] = useState("");
  const analyticsEnabled = scope === "global" || (scope === "workspace" && Boolean(workspaceId));
  const scopedWorkspaceId = scope === "workspace" ? workspaceId : undefined;
  const cohortFilter = (cohort || "") as HumanQualityCorpusCohort | "";

  const trendQuery = useQuery({
    queryKey: [
      "quality-trend",
      scope,
      workspaceId,
      cohortFilter,
      trendFilters.generationMode,
      trendFilters.format,
      trendFilters.clientProfileId,
      trendFilters.primaryFailureReason,
    ],
    queryFn: () => fetchQualityTrendReport(scopedWorkspaceId, cohortFilter, trendFilters),
    enabled: analyticsEnabled,
    retry: false,
  });

  if (scope === "workspace" && !workspaceId) return null;

  return (
    <TrendTabContent
      report={trendQuery.data}
      isLoading={trendQuery.isLoading}
      isError={trendQuery.isError}
      cohortFilter={cohortFilter}
      onCohortChange={(value) => setCohort(value)}
      trendFilters={trendFilters}
      onTrendFiltersChange={setTrendFilters}
      selectedBucketKey={selectedTrendBucketKey}
      onSelectedBucketChange={setSelectedTrendBucketKey}
    />
  );
}
