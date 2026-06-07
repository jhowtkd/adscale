"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { BetaSessionsPanel } from "@/components/feedback/BetaSessionsPanel";
import { OwnerAnalyticsPanel } from "@/components/feedback/OwnerAnalyticsPanel";
import { cn } from "@/lib/utils";

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
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as ReportDetail;
}

export default function FeedbackTriagePage() {
  const queryClient = useQueryClient();
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

  const { data, error, isLoading } = useQuery({
    queryKey: ["feedback-reports", filters],
    queryFn: () => fetchReports(filters),
    retry: false,
  });

  const creditSignalsQuery = useQuery({
    queryKey: ["feedback-mission-credit-signals"],
    queryFn: fetchMissionCreditSignals,
    retry: false,
    enabled: category === "mission" || category === "",
  });

  const detailQuery = useQuery({
    queryKey: ["feedback-report", selected?.id, selected?.workspaceId],
    queryFn: () => fetchReportDetail(selected!.workspaceId, selected!.id),
    enabled: Boolean(selected),
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
    retry: false,
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

  if (error instanceof Error && error.message === "forbidden") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--text-secondary)]">
        This triage surface is restricted to platform owners.
      </div>
    );
  }

  const reports = data?.reports ?? [];
  const detail = detailQuery.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <OwnerAnalyticsPanel sessionOptions={sessionOptions} />
      <BetaSessionsPanel />
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Beta feedback triage
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Review beta reports with linked diagnostic context.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 text-sm"
          >
            <option value="">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 text-sm sm:col-span-1 col-span-2"
          >
            <option value="">All categories</option>
            <option value="mission">Mission insights</option>
            <option value="generation">Generation</option>
            <option value="ui">UI</option>
            <option value="billing">Billing</option>
            <option value="performance">Performance</option>
            <option value="other">Other</option>
          </select>
        </div>

        {creditSignalsQuery.data ? (
          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Credit activation signals
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Separate healthy spend from frustration using mission insights.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-[var(--accent-green)]/30 bg-[var(--accent-green)]/5 px-3 py-2">
                <p className="font-medium text-[var(--accent-green)]">Healthy</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {creditSignalsQuery.data.healthyCount}
                </p>
                <p className="text-[var(--text-muted)]">
                  +{creditSignalsQuery.data.positiveAfterSpendCount} after spend
                </p>
              </div>
              <div className="rounded-md border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/5 px-3 py-2">
                <p className="font-medium text-[var(--accent-rose)]">Frustration</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {creditSignalsQuery.data.frustrationCount}
                </p>
                <p className="text-[var(--text-muted)]">
                  {creditSignalsQuery.data.creditFrictionCount} credit friction ·{" "}
                  {creditSignalsQuery.data.skippedCreditMissionCount} skipped spend steps
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No reports yet.</p>
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
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                  selected?.id === report.id
                    ? "border-[var(--accent-green)] bg-[var(--surface-raised)]"
                    : "border-[var(--border-dim)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {report.category === "mission" ? "mission insight" : `${report.type} · ${report.severity}`}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    {report.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {report.message}
                </p>
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  {report.route ?? "—"} · {new Date(report.createdAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        {!selected ? (
          <p className="text-sm text-[var(--text-muted)]">Select a report to inspect details.</p>
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

            <div className="grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
              <p>Route: {detail.report.route ?? "—"}</p>
              <p>Workspace: {detail.report.workspaceId}</p>
              <p>Campaign: {detail.report.campaignId ?? "—"}</p>
              <p>Derivation: {detail.report.derivationId ?? "—"}</p>
            </div>

            {detail.report.diagnosticContext &&
            (detail.report.diagnosticContext as Record<string, unknown>).source ===
              "mission_insight" ? (
              <div className="rounded-lg border border-[var(--accent-green)]/20 bg-[var(--accent-green)]/5 p-4 space-y-2">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  Mission insight
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
                        ? "bg-[rgba(0,179,74,0.15)] text-[var(--accent-green)]"
                        : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                    )}
                  >
                    {key}: {value ? "yes" : "no"}
                  </span>
                ))}
              </div>
            ) : null}

            {detail.assetLinks.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Assets</h3>
                <ul className="space-y-1 text-sm">
                  {detail.assetLinks.map((asset) => (
                    <li key={`${asset.kind}-${asset.id}`}>
                      {asset.url ? (
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent-green)] hover:underline"
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

            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-[var(--text-primary)]">Internal notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-[var(--text-primary)]">Resolution summary</span>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                  className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["reviewing", "resolved", "archived"] as const).map((nextStatus) => (
                <Button
                  key={nextStatus}
                  type="button"
                  variant="outline"
                  disabled={updateMutation.isPending}
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
                  Mark {nextStatus}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Loading detail…</p>
        )}
      </section>
    </div>
    </div>
  );
}
