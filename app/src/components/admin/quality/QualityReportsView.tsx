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
