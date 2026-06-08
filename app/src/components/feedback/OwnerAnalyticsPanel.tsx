"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MissionFunnelRow = {
  missionKey: string;
  entered: number;
  completed: number;
  conversionRate: number | null;
};

type CockpitStageFunnelRow = {
  stage: string;
  entered: number;
  completed: number;
  abandoned: number;
};

type CreditSurpriseRow = {
  eventId: string;
  sessionId: string | null;
  operation: string;
  estimateCredits: number;
  actualCredits: number;
  delta: number;
  createdAt: string;
};

type CreditSurpriseByOperationRow = {
  operation: string;
  surpriseCount: number;
  totalDelta: number;
  maxAbsDelta: number;
};

type SessionStageTimelineRow = {
  sessionId: string;
  stage: string;
  completedAt: string;
  gapFromPreviousMs: number | null;
};

type ReadinessOverrideSignal = {
  kind: "event" | "operator_note";
  sessionId: string;
  workspaceId: string;
  stage: string;
  blockingCount?: number;
  note?: string;
  tags?: string[];
  eventId?: string;
  action?: string;
  createdAt: string;
};

type RecipeFunnelRow = {
  recipeId: string;
  viewedCount: number;
  selectedCount: number;
};

type GuidedBriefingAbandonRow = {
  stepId: string;
  abandonCount: number;
};

type CreditSpendByStageRow = {
  stage: string;
  totalCredits: number;
  spendCount: number;
};

type ShareLinkOpenRow = {
  campaignId: string;
  openCount: number;
};

type ReadinessOverrideDimensionRow = {
  dimensionId: string;
  overrideCount: number;
};

type PostPreviewStallRow = {
  sessionId: string;
  campaignId: string | null;
  stallMs: number;
  outcome: "proceed" | "abandon";
};

type PostPreviewStallSummary = {
  medianStallMs: number | null;
  stallRate: number | null;
  stallThenProceedRate: number | null;
  rows: PostPreviewStallRow[];
};

type DraftToShareTimingSummary = {
  overallMedianMs: number | null;
  byAssistanceLevel: {
    assistanceLevel: string;
    medianMs: number;
    sessionCount: number;
  }[];
};

type ShareEngagementByAssistanceRow = {
  assistanceLevel: string;
  sessionsWithShareCreated: number;
  sessionsWithShareOpened: number;
  openRate: number | null;
};

type FunnelResponse = {
  missionFunnel: MissionFunnelRow[];
  cockpitStageFunnel: CockpitStageFunnelRow[];
  recipeFunnel?: RecipeFunnelRow[];
  guidedBriefingAbandonByStep?: GuidedBriefingAbandonRow[];
  creditSpendByStage?: CreditSpendByStageRow[];
  creditSurprises: CreditSurpriseRow[];
  creditSurprisesByOperation: CreditSurpriseByOperationRow[];
  sessionStageTimeline: SessionStageTimelineRow[];
  readinessOverrides: ReadinessOverrideSignal[];
  shareLinkOpens?: ShareLinkOpenRow[];
  readinessOverrideByDimension?: ReadinessOverrideDimensionRow[];
  postPreviewStall?: PostPreviewStallSummary;
  draftToShareTiming?: DraftToShareTimingSummary;
  shareEngagementByAssistance?: ShareEngagementByAssistanceRow[];
  totals: { events: number; sessions: number };
};

function formatGapMs(gapMs: number | null): string {
  if (gapMs === null) return "—";
  if (gapMs < 60_000) return `${Math.round(gapMs / 1000)}s`;
  return `${Math.round(gapMs / 60_000)}m`;
}

type CreditSignalsResponse = {
  healthyCount: number;
  frustrationCount: number;
  creditFrictionCount: number;
  eventSignals: {
    creditBlockedCount: number;
    creditSpendCount: number;
    surpriseCount: number;
    recentSurprises: CreditSurpriseRow[];
  };
};

export type OwnerAnalyticsFilters = {
  workspaceId: string;
  sessionId: string;
  from: string;
  to: string;
};

function buildQuery(filters: OwnerAnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters.workspaceId) params.set("workspaceId", filters.workspaceId);
  if (filters.sessionId) params.set("sessionId", filters.sessionId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

async function fetchFunnel(query: string): Promise<FunnelResponse | null> {
  const res = await apiFetch(`/api/feedback/analytics/funnel?${query}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchCreditSignals(query: string): Promise<CreditSignalsResponse | null> {
  const res = await apiFetch(`/api/feedback/analytics/credit-signals?${query}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return res.json();
}

function FunnelTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No data for current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-muted)]">
                {headers.map((header) => (
                  <th key={header} className="pb-2 pr-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-[var(--border-dim)]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="py-2 pr-3 text-[var(--text-secondary)]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OwnerAnalyticsPanel({
  sessionOptions = [],
}: {
  sessionOptions?: Array<{ id: string; label: string }>;
}) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = useMemo(
    () => ({ workspaceId, sessionId, from, to }),
    [workspaceId, sessionId, from, to]
  );
  const query = buildQuery(filters);

  const funnelQuery = useQuery({
    queryKey: ["owner-analytics-funnel", filters],
    queryFn: () => fetchFunnel(query),
    retry: false,
  });

  const creditQuery = useQuery({
    queryKey: ["owner-analytics-credit", filters],
    queryFn: () => fetchCreditSignals(query),
    retry: false,
  });

  if (funnelQuery.isFetched && funnelQuery.data === null) return null;

  const funnel = funnelQuery.data;
  const credit = creditQuery.data;

  const exportUrl = `/api/feedback/analytics/export.csv?${query}`;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Beta analytics
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Mission and cockpit funnels, credit surprises, readiness overrides.
          </p>
        </div>
        <a
          href={exportUrl}
          download="beta-analytics-export.csv"
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-dim)] bg-transparent px-3 text-sm font-medium hover:bg-[var(--surface-raised)]"
        >
          Export CSV
        </a>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Workspace ID</span>
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="Optional"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Session</span>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">All sessions</option>
            {sessionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
      </div>

      {funnelQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading analytics…</p>
      ) : funnel ? (
        <>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
            <span>{funnel.totals.events} events</span>
            <span>{funnel.totals.sessions} sessions</span>
            {credit ? (
              <>
                <span>{credit.eventSignals.creditBlockedCount} credit blocks</span>
                <span>{credit.eventSignals.surpriseCount} credit surprises</span>
              </>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FunnelTable
              title="Mission conversion"
              headers={["Mission", "Entered", "Completed", "Rate"]}
              rows={funnel.missionFunnel.map((row) => [
                row.missionKey,
                String(row.entered),
                String(row.completed),
                row.conversionRate !== null ? `${Math.round(row.conversionRate * 100)}%` : "—",
              ])}
            />
            <FunnelTable
              title="Cockpit stage funnel"
              headers={["Stage", "Entered", "Completed", "Abandoned"]}
              rows={funnel.cockpitStageFunnel.map((row) => [
                row.stage,
                String(row.entered),
                String(row.completed),
                String(row.abandoned),
              ])}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FunnelTable
              title="Recipe selection funnel"
              headers={["Recipe", "Tradeoff viewed", "Selected", "Rate"]}
              rows={(funnel.recipeFunnel ?? []).map((row) => [
                row.recipeId,
                String(row.viewedCount),
                String(row.selectedCount),
                row.viewedCount > 0
                  ? `${Math.round((row.selectedCount / row.viewedCount) * 100)}%`
                  : "—",
              ])}
            />
            <FunnelTable
              title="Guided briefing abandon by step"
              headers={["Step", "Abandons"]}
              rows={(funnel.guidedBriefingAbandonByStep ?? []).map((row) => [
                row.stepId,
                String(row.abandonCount),
              ])}
            />
          </div>

          <FunnelTable
            title="Créditos por etapa"
            headers={["Stage", "Credits spent", "Spend events"]}
            rows={(funnel.creditSpendByStage ?? []).map((row) => [
              row.stage,
              String(row.totalCredits),
              String(row.spendCount),
            ])}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <FunnelTable
              title="Credit surprises by operation"
              headers={["Operation", "Count", "Total Δ", "Max |Δ|"]}
              rows={(funnel.creditSurprisesByOperation ?? []).map((row) => [
                row.operation,
                String(row.surpriseCount),
                String(row.totalDelta),
                String(row.maxAbsDelta),
              ])}
            />
            <FunnelTable
              title="Credit surprises (recent)"
              headers={["Operation", "Estimate", "Actual", "Delta"]}
              rows={funnel.creditSurprises.map((row) => [
                row.operation,
                String(row.estimateCredits),
                String(row.actualCredits),
                String(row.delta),
              ])}
            />
          </div>

          <FunnelTable
            title={
              sessionId
                ? "Session stage timeline"
                : "Session stage timeline (all sessions)"
            }
            headers={["Session", "Stage", "Completed", "Gap"]}
            rows={(funnel.sessionStageTimeline ?? [])
              .filter((row) => !sessionId || row.sessionId === sessionId)
              .map((row) => [
                row.sessionId.slice(0, 8) + "…",
                row.stage,
                new Date(row.completedAt).toLocaleString(),
                formatGapMs(row.gapFromPreviousMs),
              ])}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <FunnelTable
              title="Share link opens by campaign"
              headers={["Campaign", "Opens"]}
              rows={(funnel.shareLinkOpens ?? []).map((row) => [
                row.campaignId.slice(0, 8) + "…",
                String(row.openCount),
              ])}
            />
            <FunnelTable
              title="Readiness overrides by dimension"
              headers={["Dimension", "Overrides"]}
              rows={(funnel.readinessOverrideByDimension ?? []).map((row) => [
                row.dimensionId,
                String(row.overrideCount),
              ])}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Post-preview stall
              </h3>
              <dl className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                <div className="flex justify-between gap-2">
                  <dt>Median stall</dt>
                  <dd>{formatGapMs(funnel.postPreviewStall?.medianStallMs ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Stall rate</dt>
                  <dd>
                    {funnel.postPreviewStall?.stallRate != null
                      ? `${Math.round(funnel.postPreviewStall.stallRate * 100)}%`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Stall → proceed</dt>
                  <dd>
                    {funnel.postPreviewStall?.stallThenProceedRate != null
                      ? `${Math.round(funnel.postPreviewStall.stallThenProceedRate * 100)}%`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Median draft → share
              </h3>
              <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                {formatGapMs(funnel.draftToShareTiming?.overallMedianMs ?? null)}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                {(funnel.draftToShareTiming?.byAssistanceLevel ?? []).map((row) => (
                  <li key={row.assistanceLevel} className="flex justify-between gap-2">
                    <span>{row.assistanceLevel}</span>
                    <span>
                      {formatGapMs(row.medianMs)} ({row.sessionCount})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <FunnelTable
              title="Share open rate by assistance"
              headers={["Assistance", "Created", "Opened", "Rate"]}
              rows={(funnel.shareEngagementByAssistance ?? []).map((row) => [
                row.assistanceLevel,
                String(row.sessionsWithShareCreated),
                String(row.sessionsWithShareOpened),
                row.openRate != null ? `${Math.round(row.openRate * 100)}%` : "—",
              ])}
            />
          </div>

          {(funnel.postPreviewStall?.rows.length ?? 0) > 0 ? (
            <FunnelTable
              title="Active post-preview stalls"
              headers={["Session", "Campaign", "Stall", "Outcome"]}
              rows={(funnel.postPreviewStall?.rows ?? []).slice(0, 12).map((row) => [
                row.sessionId.slice(0, 8) + "…",
                row.campaignId ? row.campaignId.slice(0, 8) + "…" : "—",
                formatGapMs(row.stallMs),
                row.outcome,
              ])}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Readiness override signals
              </h3>
              {funnel.readinessOverrides.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No readiness blocks or operator false-positive notes yet.
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {funnel.readinessOverrides.map((signal) => (
                    <li
                      key={`${signal.kind}-${signal.sessionId}-${signal.stage}-${signal.createdAt}`}
                      className={cn(
                        "rounded-md border px-3 py-2",
                        signal.kind === "operator_note"
                          ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/5"
                          : "border-[var(--border-dim)]"
                      )}
                    >
                      <p className="font-medium text-[var(--text-primary)]">
                        {signal.kind === "operator_note"
                          ? "Operator note"
                          : signal.action === "overridden"
                            ? "Override event"
                            : "Blocked event"}{" "}
                        · {signal.stage}
                      </p>
                      <p className="text-[var(--text-secondary)]">
                        Session {signal.sessionId.slice(0, 8)}…
                        {signal.note ? ` — ${signal.note}` : ""}
                      </p>
                      {signal.tags?.length ? (
                        <p className="text-[var(--text-muted)]">{signal.tags.join(", ")}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Unable to load analytics.</p>
      )}
    </section>
  );
}
