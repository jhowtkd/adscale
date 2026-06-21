"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ResponsiveTabs from "@/components/layout/ResponsiveTabs";
import type { HumanQualityCorpusCohort } from "@/server/human-quality/corpus";
import { LocalQualityProvider, useQualityContext } from "@/components/admin/quality/quality-context";
import QualityScopeHeader from "@/components/admin/quality/QualityScopeHeader";
import { CorpusQueueView } from "@/components/admin/quality/CorpusQueueView";
import { CorpusCandidatesView } from "@/components/admin/quality/CorpusCandidatesView";
import { CalibrationView } from "@/components/admin/quality/CalibrationView";
import { ImpactView } from "@/components/admin/quality/ImpactView";
import { QualityReportsView } from "@/components/admin/quality/QualityReportsView";
import { CoverageView } from "@/components/admin/quality/CoverageView";
import { TrendView } from "@/components/admin/quality/TrendView";
import {
  fetchCalibrationReport,
  fetchLearningImpactReport,
  fetchPendingQueue,
  fetchQualityImprovementReport,
  fetchQualityTrendReport,
  fetchSampleCoverage,
  DEFAULT_QUEUE_FILTERS,
} from "@/components/admin/quality/corpus-shared";

const PANEL_TABS = [
  { id: "queue", label: "Queue" },
  { id: "candidates", label: "Candidates" },
  { id: "calibration", label: "Calibration" },
  { id: "impact", label: "Impact" },
  { id: "quality", label: "Quality" },
  { id: "coverage", label: "Coverage" },
  { id: "trend", label: "Trend" },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];

function HumanQualityCorpusPanelInner() {
  const { scope: corpusScope, workspaceId, cohort } = useQualityContext();
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");
  const cohortFilter = (cohort || "") as HumanQualityCorpusCohort | "";

  const analyticsEnabled =
    corpusScope === "global" || (corpusScope === "workspace" && Boolean(workspaceId));
  const scopedWorkspaceId = corpusScope === "workspace" ? workspaceId : undefined;

  const queueQuery = useQuery({
    queryKey: [
      "human-quality-corpus-queue",
      corpusScope,
      workspaceId,
      DEFAULT_QUEUE_FILTERS.cohort,
      DEFAULT_QUEUE_FILTERS.generationMode,
      DEFAULT_QUEUE_FILTERS.format,
      DEFAULT_QUEUE_FILTERS.sourceLabel,
      DEFAULT_QUEUE_FILTERS.status,
    ],
    queryFn: () => fetchPendingQueue(scopedWorkspaceId, DEFAULT_QUEUE_FILTERS),
    enabled: corpusScope === "global" || Boolean(workspaceId),
    retry: false,
  });

  const calibrationQuery = useQuery({
    queryKey: ["score-calibration", corpusScope, workspaceId, cohortFilter],
    queryFn: () => fetchCalibrationReport(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  const impactQuery = useQuery({
    queryKey: ["learning-impact", corpusScope, workspaceId, cohortFilter],
    queryFn: () => fetchLearningImpactReport(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  const qualityQuery = useQuery({
    queryKey: ["quality-improvement", corpusScope, workspaceId, cohortFilter],
    queryFn: () => fetchQualityImprovementReport(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  const coverageQuery = useQuery({
    queryKey: ["sample-coverage", corpusScope, workspaceId, cohortFilter],
    queryFn: () => fetchSampleCoverage(scopedWorkspaceId, cohortFilter),
    enabled: analyticsEnabled,
    retry: false,
  });

  const trendQuery = useQuery({
    queryKey: ["quality-trend", corpusScope, workspaceId, cohortFilter, "", "", "", ""],
    queryFn: () =>
      fetchQualityTrendReport(scopedWorkspaceId, cohortFilter, {
        generationMode: "",
        format: "",
        clientProfileId: "",
        primaryFailureReason: "",
      }),
    enabled: analyticsEnabled,
    retry: false,
  });

  const queueForbidden = queueQuery.isFetched && queueQuery.data === null;
  const calibrationForbidden = calibrationQuery.isFetched && calibrationQuery.data === null;
  const impactForbidden = impactQuery.isFetched && impactQuery.data === null;
  const qualityForbidden = qualityQuery.isFetched && qualityQuery.data === null;
  const coverageForbidden = coverageQuery.isFetched && coverageQuery.data === null;
  const trendForbidden = trendQuery.isFetched && trendQuery.data === null;

  if (corpusScope === "global" && queueQuery.isFetched && queueForbidden) {
    return null;
  }

  if (
    corpusScope === "workspace" &&
    workspaceId &&
    queueQuery.isFetched &&
    calibrationQuery.isFetched &&
    impactQuery.isFetched &&
    qualityQuery.isFetched &&
    coverageQuery.isFetched &&
    trendQuery.isFetched &&
    queueForbidden &&
    calibrationForbidden &&
    impactForbidden &&
    qualityForbidden &&
    coverageForbidden &&
    trendForbidden
  ) {
    return null;
  }

  const showCohortFilter =
    activeTab === "calibration" ||
    activeTab === "impact" ||
    activeTab === "quality" ||
    activeTab === "coverage";

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Human quality corpus</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Internal evaluation queue, score calibration audit, learning impact, and quality
          improvement measurement.
        </p>
      </div>

      <QualityScopeHeader showCohortFilter={showCohortFilter} />

      {corpusScope === "workspace" && !workspaceId ? null : (
        <>
          <ResponsiveTabs
            items={[...PANEL_TABS]}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as PanelTab)}
            ariaLabel="Human quality corpus views"
          />

          {activeTab === "queue" ? (
            <CorpusQueueView key={`${corpusScope}-${workspaceId}`} />
          ) : activeTab === "candidates" ? (
            <CorpusCandidatesView />
          ) : activeTab === "calibration" ? (
            <CalibrationView />
          ) : activeTab === "impact" ? (
            <ImpactView />
          ) : activeTab === "quality" ? (
            <QualityReportsView />
          ) : activeTab === "coverage" ? (
            <CoverageView />
          ) : (
            <TrendView />
          )}
        </>
      )}
    </section>
  );
}

export function HumanQualityCorpusPanel() {
  return (
    <LocalQualityProvider>
      <HumanQualityCorpusPanelInner />
    </LocalQualityProvider>
  );
}
