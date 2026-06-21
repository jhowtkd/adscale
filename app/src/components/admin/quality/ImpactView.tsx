"use client";

import { useQuery } from "@tanstack/react-query";
import type { HumanQualityCorpusCohort } from "@/server/human-quality/corpus";
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

function ImpactReportView({
  report,
  isLoading,
  isError,
}: {
  report: ImpactReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t, tc } = useQualityLabels();

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">{t("impact.loading")}</p>;
  }

  if (isError || report == null) {
    return <p className="text-sm text-[var(--text-muted)]">{t("impact.error")}</p>;
  }

  const insufficient = report.status === "insufficient_sample";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("impact.title")}</h3>
        <p className="text-xs text-[var(--text-secondary)]">{t("impact.description")}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label={tc("status")} value={report.status} />
        <MetadataRow label={tc("evaluatedItems")} value={String(report.evaluatedItemCount)} />
        <MetadataRow label={t("impact.learnedArm")} value={String(report.learningImpactMetrics.learnedCount)} />
        <MetadataRow
          label={t("impact.nonLearnedArm")}
          value={String(report.learningImpactMetrics.nonLearnedCount)}
        />
        <MetadataRow label={t("impact.unlabeled")} value={String(report.learningImpactMetrics.unlabeledCount)} />
      </dl>

      {insufficient ? (
        <div className="space-y-2">
          <SampleGuidanceList
            guidance={report.sampleGuidance}
            fallback={t("impact.insufficientFallback")}
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
          {tc("globalVisualDelta", {
            delta: formatSignedDelta(report.learningImpactMetrics.globalVisualScoreDelta),
          })}
        </p>
      )}

      {report.learningImpactMetrics.slices.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t("impact.sliceComparisons")}
          </h4>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t("impact.slice")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("impact.learnedN")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("impact.nonLearnedN")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("impact.visualDelta")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("impact.comparability")}</th>
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
          {t("impact.intentMetrics")}
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow label={t("impact.learnedRejectRate")} value={formatRate(report.intentMetrics.learned.rejectRate)} />
          <MetadataRow
            label={t("impact.learnedRegenerateRate")}
            value={formatRate(report.intentMetrics.learned.regenerateRate)}
          />
          <MetadataRow
            label={t("impact.nonLearnedRejectRate")}
            value={formatRate(report.intentMetrics.nonLearned.rejectRate)}
          />
          <MetadataRow
            label={t("impact.nonLearnedRegenerateRate")}
            value={formatRate(report.intentMetrics.nonLearned.regenerateRate)}
          />
        </dl>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t("impact.visualMovementMetrics")}
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label={t("impact.learnedMeanVisual")}
            value={formatNullableNumber(report.visualMovementMetrics.learnedMeanVisualScore, 1)}
          />
          <MetadataRow
            label={t("impact.nonLearnedMeanVisual")}
            value={formatNullableNumber(report.visualMovementMetrics.nonLearnedMeanVisualScore, 1)}
          />
          <MetadataRow
            label={t("impact.deltaLearnedMinusNonLearned")}
            value={formatSignedDelta(report.visualMovementMetrics.deltaLearnedMinusNonLearned)}
          />
        </dl>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t("impact.factualMetricsPerArm")}
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label={t("impact.learnedFactualPassRate")}
            value={formatRate(report.factualMetrics.learnedFactualPassRate)}
          />
          <MetadataRow
            label={t("impact.nonLearnedFactualPassRate")}
            value={formatRate(report.factualMetrics.nonLearnedFactualPassRate)}
          />
        </dl>
      </div>

      {report.rows.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t("impact.evaluatedRows")}
            </h4>
            {report.truncated ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                {tc("showing", {
                  shown: report.rows.length,
                  total: report.totalRowCount ?? report.rows.length,
                })}
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{tc("item")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("impact.learning")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("impact.visual")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("impact.intent")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{tc("factual")}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.corpusItemId} className="border-t border-[var(--border-dim)]">
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {row.corpusItemId.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-1.5">
                      {row.learningApplied ? t("impact.learned") : t("impact.nonLearned")}
                    </td>
                    <td className="px-2 py-1.5 text-right">{row.visualScore}</td>
                    <td className="px-2 py-1.5">{row.intent}</td>
                    <td className="px-2 py-1.5">{row.factualPass ? tc("pass") : tc("fail")}</td>
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

export function ImpactView() {
  const { scope, workspaceId, cohort } = useQualityContext();
  const analyticsEnabled = scope === "global" || (scope === "workspace" && Boolean(workspaceId));
  const scopedWorkspaceId = scope === "workspace" ? workspaceId : undefined;
  const cohortFilter = (cohort || "") as HumanQualityCorpusCohort | "";

  const impactQuery = useQuery({
    queryKey: ["learning-impact", scope, workspaceId, cohortFilter],
    queryFn: () => fetchLearningImpactReport(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  if (scope === "workspace" && !workspaceId) return null;

  return (
    <ImpactReportView
      report={impactQuery.data}
      isLoading={impactQuery.isLoading}
      isError={impactQuery.isError}
    />
  );
}
