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
import { useQualityLabels } from "./quality-labels";

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
  const { t, tc } = useQualityLabels();

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
    return <p className="text-sm text-[var(--text-muted)]">{t("trend.loading")}</p>;
  }

  if (isError || report == null) {
    return <p className="text-sm text-[var(--text-muted)]">{t("trend.error")}</p>;
  }

  const insufficient = report.status === "insufficient_sample";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("trend.title")}</h3>
        <p className="text-xs text-[var(--text-secondary)]">{t("trend.description")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{t("scope.cohortFilter")}</span>
          <select
            value={cohortFilter}
            onChange={(e) => onCohortChange(e.target.value as HumanQualityCorpusCohort | "")}
            aria-label={t("scope.cohortFilter")}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">{t("scope.allCohorts")}</option>
            {HUMAN_QUALITY_CORPUS_COHORTS.map((cohort) => (
              <option key={cohort} value={cohort}>
                {cohort}
              </option>
            ))}
          </select>
        </label>

        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{t("trend.generationMode")}</span>
          <select
            value={trendFilters.generationMode}
            onChange={(e) =>
              onTrendFiltersChange({ ...trendFilters, generationMode: e.target.value })
            }
            aria-label="Trend generation mode filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">{tc("allModes")}</option>
            {TREND_GENERATION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>

        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{tc("format")}</span>
          <select
            value={trendFilters.format}
            onChange={(e) => onTrendFiltersChange({ ...trendFilters, format: e.target.value })}
            aria-label="Trend format filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">{tc("allFormats")}</option>
            {TREND_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-[12rem] flex-1 gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{t("trend.clientProfileId")}</span>
          <input
            value={trendFilters.clientProfileId}
            onChange={(e) =>
              onTrendFiltersChange({ ...trendFilters, clientProfileId: e.target.value })
            }
            placeholder={t("trend.clientProfilePlaceholder")}
            aria-label="Trend client profile ID filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-[11px]"
          />
        </label>

        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{t("trend.primaryFailureReason")}</span>
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
            <option value="">{tc("allReasons")}</option>
            {HUMAN_QUALITY_FAILURE_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {FAILURE_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label={tc("status")} value={report.status} />
        <MetadataRow label={tc("evaluatedItems")} value={String(report.evaluatedItemCount)} />
        <MetadataRow label={t("trend.populatedBuckets")} value={String(report.populatedBucketCount)} />
        <MetadataRow label={t("trend.evidenceSource")} value={report.evidenceSource} />
        <MetadataRow
          label={t("trend.latestEvaluated")}
          value={
            report.latestEvaluatedAt
              ? new Date(report.latestEvaluatedAt).toLocaleString()
              : "—"
          }
        />
      </dl>

      {report.truncated ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
          {t("trend.truncated")}
        </p>
      ) : null}

      {report.alertFlags.insufficientCoverage ? (
        <div
          className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
          data-testid="trend-alert-insufficient-coverage"
        >
          <p className="text-xs font-medium text-amber-100">{t("trend.insufficientCoverage")}</p>
          {report.alertFlags.reasons?.insufficientCoverage ? (
            <p className="text-xs text-amber-100/90">{report.alertFlags.reasons.insufficientCoverage}</p>
          ) : null}
          <SampleGuidanceList
            guidance={report.sampleGuidance}
            fallback={t("trend.insufficientFallback")}
          />
        </div>
      ) : null}

      {report.alertFlags.staleEvidence ? (
        <p
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-100"
          data-testid="trend-alert-stale-evidence"
        >
          {t("trend.staleEvidence")}
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
          {t("trend.regressionDetected")}
          {report.alertFlags.reasons?.regressionDetected
            ? `: ${report.alertFlags.reasons.regressionDetected}`
            : ""}
        </p>
      ) : null}

      {insufficient ? (
        <SampleGuidanceList
          guidance={report.sampleGuidance}
          fallback={t("trend.insufficientTrendFallback")}
        />
      ) : null}

      {chartData.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t("trend.weeklyMetrics")}
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
                    value: t("trend.visualScoreAxis"),
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
                    value: t("trend.factualPassAxis"),
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
                      return [`${value.toFixed(0)}%`, t("trend.factualPassRateTooltip")];
                    }
                    if (name === "meanHumanVisualScore" && typeof value === "number") {
                      return [value.toFixed(1), t("trend.meanVisualScoreTooltip")];
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
                {t("trend.learningImpactComparability", {
                  bucket: point.bucketKey,
                  status:
                    point.learningImpactStatus === "ok"
                      ? t("trend.comparabilityOk")
                      : t("trend.comparabilityInsufficient"),
                  count: point.count,
                })}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">{t("trend.noPopulatedBuckets")}</p>
      )}

      {report.buckets.length > 0 ? (
        <label className="grid max-w-md gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{t("trend.evidenceBucket")}</span>
          <select
            value={selectedBucketKey}
            onChange={(e) => onSelectedBucketChange(e.target.value)}
            aria-label={t("trend.evidenceBucket")}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-[11px]"
          >
            <option value="">{t("trend.selectBucket")}</option>
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
              {t("trend.bucketEvidence", { bucket: selectedBucket.bucketKey })}
            </h4>
            {selectedBucket.evidenceRefs.truncated ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                {tc("showing", {
                  shown: selectedBucket.evidenceRefs.itemRefs.length,
                  total: selectedBucket.evidenceRefs.totalCount,
                })}
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{tc("item")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("impact.visual")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{tc("factual")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("trend.evaluated")}</th>
                </tr>
              </thead>
              <tbody>
                {selectedBucket.evidenceRefs.itemRefs.map((row) => (
                  <tr key={row.corpusItemId} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {row.corpusItemId.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-1.5 text-right">{row.visualScore}</td>
                    <td className="px-2 py-1.5">{row.factualPass ? tc("pass") : tc("fail")}</td>
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
        <p className="text-xs text-[var(--text-muted)]">{t("trend.noEvidenceRows")}</p>
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
