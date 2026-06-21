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

export function CalibrationView() {
  const { scope, workspaceId, cohort } = useQualityContext();
  const analyticsEnabled = scope === "global" || (scope === "workspace" && Boolean(workspaceId));
  const scopedWorkspaceId = scope === "workspace" ? workspaceId : undefined;
  const cohortFilter = (cohort || "") as HumanQualityCorpusCohort | "";

  const calibrationQuery = useQuery({
    queryKey: ["score-calibration", scope, workspaceId, cohortFilter],
    queryFn: () => fetchCalibrationReport(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  if (scope === "workspace" && !workspaceId) return null;

  return (
    <CalibrationTabContent
      report={calibrationQuery.data}
      isLoading={calibrationQuery.isLoading}
      isError={calibrationQuery.isError}
    />
  );
}
