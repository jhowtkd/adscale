"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { usePlatformOwnerAccess } from "@/lib/hooks/use-platform-owner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BetaSessionsPanel } from "@/components/feedback/BetaSessionsPanel";
import { TesterProfilesPanel } from "@/components/feedback/TesterProfilesPanel";
import { OwnerAnalyticsPanel } from "@/components/feedback/OwnerAnalyticsPanel";
import { HumanQualityCorpusPanel } from "@/components/feedback/HumanQualityCorpusPanel";
import { GuidedFlowFeedbackPanel } from "@/components/feedback/GuidedFlowFeedbackPanel";
import { DiagnosticsTabPanel } from "@/components/feedback/diagnostics/DiagnosticsTabPanel";
import { AdminInspirationsPanel } from "@/components/admin/AdminInspirationsPanel";
import { cn } from "@/lib/utils";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import {
  ownerButtonClass,
  ownerFieldClass,
  ownerListItemClass,
  ownerNavClass,
  ownerNavItemClass,
  ownerShellClass,
} from "@/components/feedback/owner-chrome";

type FeedbackReport = {
  id: string;
  workspaceId: string;
  userId: string;
  status: string;
  type: string;
  severity: string;
  category: string;
  message: string;
  route: string | null;
  contextKind: string;
  campaignId: string | null;
  derivationId: string | null;
  contextCompleteness: Record<string, boolean> | null;
  sentryCorrelation: Record<string, string> | null;
  diagnosticContext: Record<string, unknown> | null;
  internalNotes: string | null;
  resolutionSummary: string | null;
  createdAt: string;
};

type ReportDetail = {
  report: FeedbackReport;
  assetLinks: Array<{ kind: string; id: string; url?: string; key?: string }>;
  derivationSummary: Record<string, unknown> | null;
};

async function fetchReports(filters: Record<string, string>) {
  const params = new URLSearchParams(filters);
  const res = await apiFetch(`/api/feedback/reports?${params.toString()}`);
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as { reports: FeedbackReport[] };
}

type MissionCreditSignals = {
  healthyCount: number;
  frustrationCount: number;
  creditFrictionCount: number;
  skippedCreditMissionCount: number;
  positiveAfterSpendCount: number;
  recentExamples: Array<{
    id: string;
    signal: "healthy" | "frustration";
    moment: string;
    missionKey: string | null;
    sentiment: string | null;
    reason: string | null;
    createdAt: string;
  }>;
};

async function fetchMissionCreditSignals() {
  const res = await apiFetch("/api/feedback/mission-credit-signals");
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as MissionCreditSignals;
}

async function fetchReportDetail(workspaceId: string, id: string) {
  const res = await apiFetch(
    `/api/feedback/reports/${id}?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as ReportDetail;
}

function retryFeedbackQuery(failureCount: number, error: unknown) {
  return !(error instanceof Error && error.message === "forbidden") && failureCount < 1;
}

export default function FeedbackTriagePage() {
  const t = useTranslations("feedback.triage");
  const tFeedback = useTranslations("feedback");
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: ownerAccess, isLoading: ownerAccessLoading } = usePlatformOwnerAccess();

  const isPlatformOwner = ownerAccess?.allowed === true;

  useEffect(() => {
    if (!ownerAccessLoading && ownerAccess && !isPlatformOwner) {
      router.replace("/campaigns");
    }
  }, [isPlatformOwner, ownerAccess, ownerAccessLoading, router]);

  const [consoleTab, setConsoleTab] = useState<"metrics" | "quality" | "feedback" | "inspirations" | "diagnostics">("feedback");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<FeedbackReport | null>(null);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");

  const filters = useMemo(() => {
    const value: Record<string, string> = {};
    if (status) value.status = status;
    if (severity) value.severity = severity;
    if (category) value.category = category;
    return value;
  }, [status, severity, category]);

  const { data, error, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["feedback-reports", filters],
    queryFn: () => fetchReports(filters),
    retry: retryFeedbackQuery,
    enabled: isPlatformOwner,
  });

  const creditSignalsQuery = useQuery({
    queryKey: ["feedback-mission-credit-signals"],
    queryFn: fetchMissionCreditSignals,
    retry: retryFeedbackQuery,
    enabled: isPlatformOwner && (category === "mission" || category === ""),
  });

  const detailQuery = useQuery({
    queryKey: ["feedback-report", selected?.id, selected?.workspaceId],
    queryFn: () => fetchReportDetail(selected!.workspaceId, selected!.id),
    retry: retryFeedbackQuery,
    enabled: isPlatformOwner && Boolean(selected),
  });

  const sessionsQuery = useQuery({
    queryKey: ["beta-sessions-list"],
    queryFn: async () => {
      const res = await apiFetch("/api/feedback/sessions");
      if (res.status === 403) return [];
      if (!res.ok) throw new Error("failed");
      const payload = (await res.json()) as {
        sessions?: Array<{ id: string; cohortLabel: string | null; startedAt: string }>;
      };
      return payload.sessions ?? [];
    },
    retry: retryFeedbackQuery,
    enabled: isPlatformOwner,
  });

  const sessionOptions = useMemo(
    () =>
      (sessionsQuery.data ?? []).map((session) => ({
        id: session.id,
        label: session.cohortLabel ?? `Session ${session.id.slice(0, 8)}`,
      })),
    [sessionsQuery.data]
  );

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      workspaceId: string;
      status?: string;
      internalNotes?: string | null;
      resolutionSummary?: string | null;
    }) => {
      const res = await apiFetch(
        `/api/feedback/reports/${payload.id}?workspaceId=${encodeURIComponent(payload.workspaceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: payload.status,
            internalNotes: payload.internalNotes,
            resolutionSummary: payload.resolutionSummary,
          }),
        }
      );
      if (!res.ok) throw new Error("update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback-reports"] });
      if (selected) {
        queryClient.invalidateQueries({
          queryKey: ["feedback-report", selected.id, selected.workspaceId],
        });
      }
    },
  });

  if (ownerAccessLoading) return null;

  if (!isPlatformOwner || (error instanceof Error && error.message === "forbidden")) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--text-secondary)]">
        {t("forbidden")}
      </div>
    );
  }

  const reports = data?.reports ?? [];
  const detail = detailQuery.data;
  const reportsError = Boolean(error);
  const detailError = Boolean(detailQuery.error);

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />

      <div className={ownerShellClass}>
      <nav aria-label={t("consoleTabsAria")} className={ownerNavClass}>
        {(["metrics", "quality", "feedback", "inspirations", "diagnostics"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-current={consoleTab === tab ? "page" : undefined}
            onClick={() => setConsoleTab(tab)}
            className={ownerNavItemClass(consoleTab === tab)}
          >
            {t(`consoleTabs.${tab}`)}
          </button>
        ))}
      </nav>

      <div
        id={`owner-console-panel-${consoleTab}`}
        className="min-w-0 space-y-6"
      >
      {consoleTab === "metrics" ? <OwnerAnalyticsPanel sessionOptions={sessionOptions} /> : null}
      {consoleTab === "quality" ? <HumanQualityCorpusPanel /> : null}
      {consoleTab === "inspirations" ? <AdminInspirationsPanel /> : null}
      {consoleTab === "diagnostics" ? <DiagnosticsTabPanel isPlatformOwner={isPlatformOwner} /> : null}
      {consoleTab === "feedback" ? (
        <>
          <TesterProfilesPanel />
          <GuidedFlowFeedbackPanel />
          <BetaSessionsPanel />
        </>
      ) : null}
      {consoleTab === "feedback" ? <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t("filterStatus")}
            className={ownerFieldClass}
          >
            <option value="">{t("allStatuses")}</option>
            <option value="new">{t("statusNew")}</option>
            <option value="reviewing">{t("statusReviewing")}</option>
            <option value="resolved">{t("statusResolved")}</option>
            <option value="archived">{t("statusArchived")}</option>
          </select>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label={t("filterSeverity")}
            className={ownerFieldClass}
          >
            <option value="">{t("allSeverities")}</option>
            <option value="low">{tFeedback("severities.low")}</option>
            <option value="medium">{tFeedback("severities.medium")}</option>
            <option value="high">{tFeedback("severities.high")}</option>
            <option value="critical">{tFeedback("severities.critical")}</option>
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t("filterCategory")}
            className={`col-span-2 sm:col-span-1 ${ownerFieldClass}`}
          >
            <option value="">{t("allCategories")}</option>
            <option value="mission">{tFeedback("categories.mission")}</option>
            <option value="generation">{tFeedback("categories.generation")}</option>
            <option value="ui">{tFeedback("categories.ui")}</option>
            <option value="billing">{tFeedback("categories.billing")}</option>
            <option value="performance">{tFeedback("categories.performance")}</option>
            <option value="other">{tFeedback("categories.other")}</option>
          </select>
        </div>

        {creditSignalsQuery.data ? (
          <div className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("creditSignalsTitle")}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {t("creditSignalsDescription")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2">
                <p className="font-medium text-[var(--success-text)]">{t("healthy")}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {creditSignalsQuery.data.healthyCount}
                </p>
                <p className="text-[var(--success-text)]">
                  {t("afterSpend", { count: creditSignalsQuery.data.positiveAfterSpendCount })}
                </p>
              </div>
              <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2">
                <p className="font-medium text-[var(--danger-text)]">{t("frustration")}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {creditSignalsQuery.data.frustrationCount}
                </p>
                <p className="text-[var(--danger-text)]">
                  {t("creditFriction", {
                    friction: creditSignalsQuery.data.creditFrictionCount,
                    skipped: creditSignalsQuery.data.skippedCreditMissionCount,
                  })}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {reportsError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]"
          >
            <span>{t("loadError")}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} className={ownerButtonClass}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        {dataUpdatedAt > 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t("lastUpdated", { time: new Date(dataUpdatedAt).toLocaleTimeString() })}
          </p>
        ) : null}

        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
          ) : reportsError && reports.length === 0 ? null : reports.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("noReports")}</p>
          ) : (
            reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => {
                  setSelected(report);
                  setNotes(report.internalNotes ?? "");
                  setResolution(report.resolutionSummary ?? "");
                }}
                className={ownerListItemClass(selected?.id === report.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {report.category === "mission" ? "mission insight" : `${report.type} · ${report.severity}`}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    {report.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {report.message}
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {report.route ?? "—"} · {new Date(report.createdAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
        </div>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto">
        {!selected ? (
          <p className="text-sm text-[var(--text-muted)]">Select a report to inspect details.</p>
        ) : detailError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]"
          >
            <span>{t("loadError")}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void detailQuery.refetch()} className={ownerButtonClass}>
              {t("retry")}
            </Button>
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {detail.report.type} / {detail.report.category}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                {detail.report.message}
              </p>
            </div>

            <details className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
                {t("technicalDetails")}
              </summary>
              <div className="space-y-4 border-t border-[var(--border-dim)] px-3 py-3">
                <div className="grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
                  <p>{t("route")}: {detail.report.route ?? "—"}</p>
                  <p>{t("workspace")}: {detail.report.workspaceId}</p>
                  <p>{t("campaign")}: {detail.report.campaignId ?? "—"}</p>
                  <p>{t("derivation")}: {detail.report.derivationId ?? "—"}</p>
                </div>

                {detail.report.diagnosticContext &&
                (detail.report.diagnosticContext as Record<string, unknown>).source ===
                  "mission_insight" ? (
                  <div className="space-y-2 rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] p-4">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">
                      {t("missionInsight")}
                    </h3>
                    <div className="grid gap-1 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
                      <p>Moment: {String(detail.report.diagnosticContext.moment ?? "—")}</p>
                      <p>Mission: {String(detail.report.diagnosticContext.missionKey ?? "—")}</p>
                      <p>Sentiment: {String(detail.report.diagnosticContext.sentiment ?? "—")}</p>
                      <p>Reason: {String(detail.report.diagnosticContext.reason ?? "—")}</p>
                      <p>Action: {String(detail.report.diagnosticContext.action ?? "—")}</p>
                    </div>
                  </div>
                ) : null}

                {detail.report.contextCompleteness ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(detail.report.contextCompleteness).map(([key, value]) => (
                      <span
                        key={key}
                        className={cn(
                          "rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
                          value
                            ? "bg-[var(--success-bg)] text-[var(--success-text)]"
                            : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                        )}
                      >
                        {key}: {value ? t("yes") : t("no")}
                      </span>
                    ))}
                  </div>
                ) : null}

                {detail.assetLinks.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("assets")}</h3>
                    <ul className="space-y-1 text-sm">
                      {detail.assetLinks.map((asset) => (
                        <li key={`${asset.kind}-${asset.id}`}>
                          {asset.url ? (
                            <a
                              href={asset.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--selection-text)] hover:underline"
                            >
                              {asset.kind} · {asset.key ?? asset.id}
                            </a>
                          ) : (
                            <span>{asset.kind} · {asset.id}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>

            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{t("internalNotes")}</span>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="bg-[var(--surface-raised)] border-[var(--border-dim)]"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{t("resolutionSummary")}</span>
                <Textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                  className="bg-[var(--surface-raised)] border-[var(--border-dim)]"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["reviewing", "resolved", "archived"] as const).map((nextStatus) => (
                <Button
                  key={nextStatus}
                  type="button"
                  disabled={updateMutation.isPending}
                  className={ownerButtonClass}
                  onClick={() =>
                    updateMutation.mutate({
                      id: selected.id,
                      workspaceId: selected.workspaceId,
                      status: nextStatus,
                      internalNotes: notes,
                      resolutionSummary: resolution,
                    })
                  }
                >
                  {t("markStatus", { status: nextStatus })}
                </Button>
              ))}
            </div>
          </div>
        ) : detailQuery.isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">{t("loadingDetail")}</p>
        ) : null}
        {detail && detailQuery.dataUpdatedAt > 0 ? (
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            {t("lastUpdated", { time: new Date(detailQuery.dataUpdatedAt).toLocaleTimeString() })}
          </p>
        ) : null}
        </div>
      </div> : null}
      </div>
      </div>
    </PageFrame>
  );
}
