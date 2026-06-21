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
  const { t, tc } = useQualityLabels();

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">{t("coverage.loading")}</p>;
  }

  if (isError || report == null) {
    return <p className="text-sm text-[var(--text-muted)]">{t("coverage.error")}</p>;
  }

  return (
    <div className="space-y-4">
      {globalEvidence ? (
        <div className="space-y-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("coverage.globalEvidence")}</h3>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetadataRow label={t("coverage.operationalStatus")} value={globalEvidence.operationalStatus} />
            <MetadataRow label={t("coverage.pendingItems")} value={String(globalEvidence.pendingItemCount)} />
            <MetadataRow
              label={t("coverage.fixtureOnly")}
              value={globalEvidence.fixtureOnly ? tc("yes") : tc("no")}
            />
            <MetadataRow
              label={t("coverage.sourceMix")}
              value={tc("sourceMix", {
                real: globalEvidence.sourceComposition.real_customer,
                synth: globalEvidence.sourceComposition.synthetic_fixture,
                op: globalEvidence.sourceComposition.operator_imported,
              })}
            />
          </dl>
          {globalEvidence.withheldClaims.length > 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {tc("withheldClaims", { claims: globalEvidence.withheldClaims.join("; ") })}
            </p>
          ) : null}
          {globalEvidence.dependsOnOperator.length > 0 ? (
            <p className="text-xs text-amber-400">{globalEvidence.dependsOnOperator[0]}</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("coverage.title")}</h3>
        <p className="text-xs text-[var(--text-secondary)]">{t("coverage.description")}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <MetadataRow label={tc("evaluatedItems")} value={String(report.evaluatedItemCount)} />
        <MetadataRow label={t("coverage.nextGate")} value={report.nextGate} />
        <MetadataRow label={t("coverage.captured")} value={new Date(report.capturedAt).toLocaleString()} />
      </dl>

      <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]">
        {report.nextOperatorAction}
      </p>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t("coverage.gateStatus")}
        </h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">{t("coverage.gate")}</th>
                <th className="px-2 py-1.5 text-left font-medium">{tc("status")}</th>
                <th className="px-2 py-1.5 text-left font-medium">{t("coverage.blockedClaims")}</th>
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
            {t("coverage.sliceGaps")}
          </h4>
          <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t("coverage.gate")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("coverage.sliceDimension")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("coverage.arm")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("coverage.need")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("coverage.blockedClaim")}</th>
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
        <p className="text-xs text-[var(--text-secondary)]">{t("coverage.noSliceGaps")}</p>
      )}
    </div>
  );
}

export function CoverageView() {
  const { scope, workspaceId, cohort } = useQualityContext();
  const analyticsEnabled = scope === "global" || (scope === "workspace" && Boolean(workspaceId));
  const scopedWorkspaceId = scope === "workspace" ? workspaceId : undefined;
  const cohortFilter = (cohort || "") as HumanQualityCorpusCohort | "";

  const coverageQuery = useQuery({
    queryKey: ["sample-coverage", scope, workspaceId, cohortFilter],
    queryFn: () => fetchSampleCoverage(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  const globalEvidenceQuery = useQuery({
    queryKey: ["global-corpus-evidence", cohortFilter],
    queryFn: () => fetchGlobalCorpusEvidence(cohortFilter),
    enabled: scope === "global",
    retry: false,
  });

  if (scope === "workspace" && !workspaceId) return null;

  return (
    <CoverageTabContent
      report={coverageQuery.data}
      globalEvidence={globalEvidenceQuery.data}
      isLoading={coverageQuery.isLoading || globalEvidenceQuery.isLoading}
      isError={coverageQuery.isError}
    />
  );
}
