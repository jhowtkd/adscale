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

function QualityImprovementReportView({
  report,
  isLoading,
  isError,
}: {
  report: QualityReportResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t, tc } = useQualityLabels();

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">{t("reports.loading")}</p>;
  }

  if (isError || report == null) {
    return <p className="text-sm text-[var(--text-muted)]">{t("reports.error")}</p>;
  }

  const insufficient = report.status === "insufficient_sample";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("reports.title")}
        </h3>
        <p className="text-xs text-[var(--text-secondary)]">{t("reports.description")}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataRow label={tc("status")} value={report.status} />
        <MetadataRow label={t("reports.rubricVersion")} value={report.rubricCalibrationVersion} />
        <MetadataRow label={t("reports.acceptedAdjustments")} value={String(report.acceptedAdjustments.length)} />
        {report.fixtureMetrics ? (
          <>
            <MetadataRow
              label={t("reports.fixturePassAfter")}
              value={formatRate(report.fixtureMetrics.targetedArchetypePassRateAfter)}
            />
            <MetadataRow label={t("reports.evidenceSource")} value={t("reports.fixture")} />
          </>
        ) : null}
      </dl>

      {insufficient ? (
        <SampleGuidanceList
          guidance={report.sampleGuidance}
          fallback={t("reports.insufficientFallback")}
        />
      ) : null}

      {report.acceptedAdjustments.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t("reports.acceptedAdjustments")}
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
          {t("reports.visualFailureFrequency")}
        </h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">{t("reports.reason")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("reports.beforeCount")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("reports.beforeRate")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("reports.afterCount")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("reports.afterRate")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("reports.deltaRate")}</th>
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
            {t("reports.fixtureGateDetection")}
          </h4>
          <dl className="space-y-1.5">
            <MetadataRow
              label={t("reports.targetedArchetypePassBefore")}
              value={formatRate(report.fixtureMetrics.targetedArchetypePassRateBefore)}
            />
            <MetadataRow
              label={t("reports.targetedArchetypePassAfter")}
              value={formatRate(report.fixtureMetrics.targetedArchetypePassRateAfter)}
            />
          </dl>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t("reports.factualPassRates")}
        </h4>
        <dl className="space-y-1.5">
          <MetadataRow
            label={t("reports.beforeArmFactualPassRate")}
            value={formatRate(report.factualMetrics.factualPassRateBefore)}
          />
          <MetadataRow
            label={t("reports.afterArmFactualPassRate")}
            value={formatRate(report.factualMetrics.factualPassRateAfter)}
          />
        </dl>
      </div>
    </div>
  );
}

export function QualityReportsView() {
  const { scope, workspaceId, cohort } = useQualityContext();
  const analyticsEnabled = scope === "global" || (scope === "workspace" && Boolean(workspaceId));
  const scopedWorkspaceId = scope === "workspace" ? workspaceId : undefined;
  const cohortFilter = (cohort || "") as HumanQualityCorpusCohort | "";

  const qualityQuery = useQuery({
    queryKey: ["quality-improvement", scope, workspaceId, cohortFilter],
    queryFn: () => fetchQualityImprovementReport(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  if (scope === "workspace" && !workspaceId) return null;

  return (
    <QualityImprovementReportView
      report={qualityQuery.data}
      isLoading={qualityQuery.isLoading}
      isError={qualityQuery.isError}
    />
  );
}
