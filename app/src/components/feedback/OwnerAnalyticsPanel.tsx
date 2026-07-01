"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { HumanQualityCorpusPanel } from "@/components/feedback/HumanQualityCorpusPanel";
import { useAnalyticsLabels } from "@/components/feedback/analytics-labels";
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

type GuidedFlowFunnelResponse = {
  implementationCoverage: {
    telemetryEnabled: boolean;
    pathsCovered: string[];
    eventKeysObserved: string[];
  };
  operationalEvidence: {
    sampleSufficient: boolean;
    minSampleThreshold: number;
    observedStarts: number;
    note: string;
  };
  pathFunnel: Array<{
    path: string;
    starts: number;
    completions: number;
    abandonments: number;
    failures: number;
    blocked: number;
  }>;
  stepDropoff: Array<{
    path: string;
    step: string;
    views: number;
    dropoffs: number;
  }>;
  topBlockers: Array<{
    path: string;
    blockerCategory: string;
    count: number;
  }>;
  investigationLinks: Array<{
    threadId: string;
    workspaceId: string;
    clientProfileId: string;
    path: string;
    lastStep: string;
    lastEventKey: string;
    occurredAt: string;
  }>;
  totals: { events: number };
};

type DerivationAutoRetryFunnelSummary = {
  triggered: number;
  succeeded: number;
  unchanged: number;
  successRate: number | null;
  byGenerationMode: Array<{
    generationMode: string;
    triggered: number;
    succeeded: number;
    unchanged: number;
    successRate: number | null;
  }>;
  byFailureCode: Array<{
    reasonCode: string;
    triggered: number;
    succeeded: number;
    unchanged: number;
    successRate: number | null;
  }>;
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
  derivationAutoRetryFunnel?: DerivationAutoRetryFunnelSummary;
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

async function fetchGuidedFlowFunnel(query: string): Promise<GuidedFlowFunnelResponse | null> {
  const res = await apiFetch(`/api/feedback/analytics/guided-flow-funnel?${query}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return res.json();
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

function RateCell({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  const pct = Math.round(rate * 100);

  return (
    <div className="flex min-w-[5.5rem] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-dim)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            pct > 0 ? "bg-[var(--accent-green)]" : "bg-transparent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "tabular-nums",
          pct > 0 ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

function CountCell({ value, highlight }: { value: number; highlight?: "positive" | "warning" }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        highlight === "positive" && value > 0 && "font-medium text-[var(--text-primary)]",
        highlight === "warning" && value > 0 && "font-medium text-[var(--accent-rose)]"
      )}
    >
      {value}
    </span>
  );
}

function FunnelTable({
  title,
  headers,
  rows,
  noDataLabel,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
  noDataLabel: string;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-[var(--text-primary)]">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{noDataLabel}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-xs">
            <thead>
              <tr className="text-left text-[var(--text-muted)]">
                {headers.map((header) => (
                  <th key={header} className="px-1 pb-2 pr-4 font-medium whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-[var(--border-dim)]">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-1 py-2.5 pr-4 align-middle text-[var(--text-secondary)]"
                    >
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

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2">
      <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function AnalyticsGroup({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--text-primary)] marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-[var(--text-muted)] transition-transform duration-200 ease-out group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-6 border-t border-[var(--border-dim)] px-4 py-4">{children}</div>
    </details>
  );
}

function FunnelSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-md border border-[var(--border-dim)]/80 bg-[var(--surface-base)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-[var(--text-muted)] transition-transform duration-200 ease-out group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-[var(--border-dim)]/80 px-3 py-3">{children}</div>
    </details>
  );
}

export function OwnerAnalyticsPanel({
  sessionOptions = [],
}: {
  sessionOptions?: Array<{ id: string; label: string }>;
}) {
  const {
    t,
    missionLabel,
    stageLabel,
    recipeLabel,
    stepLabel,
    dimensionLabel,
    operationLabel,
    generationModeLabel,
    assistanceLabel,
    guidedPathLabel,
    blockerLabel,
  } = useAnalyticsLabels();

  const [workspaceId, setWorkspaceId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = useMemo(
    () => ({ workspaceId, sessionId, from, to }),
    [workspaceId, sessionId, from, to]
  );
  const query = buildQuery(filters);
  const filtersActive = Boolean(workspaceId || sessionId || from || to);

  const funnelQuery = useQuery({
    queryKey: ["owner-analytics-funnel", filters],
    queryFn: () => fetchFunnel(query),
    retry: false,
  });

  const guidedFlowQuery = useQuery({
    queryKey: ["owner-analytics-guided-flow", filters],
    queryFn: () => fetchGuidedFlowFunnel(query),
    retry: false,
  });

  const creditQuery = useQuery({
    queryKey: ["owner-analytics-credit", filters],
    queryFn: () => fetchCreditSignals(query),
    retry: false,
  });

  if (funnelQuery.isFetched && funnelQuery.data === null) return null;

  const funnel = funnelQuery.data;
  const guidedFlow = guidedFlowQuery.data;
  const credit = creditQuery.data;
  const exportUrl = `/api/feedback/analytics/export.csv?${query}`;
  const noDataLabel = t("noData");

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("title")}</h2>
            <p className="max-w-prose text-sm text-[var(--text-secondary)]">{t("description")}</p>
          </div>
          <a
            href={exportUrl}
            download="beta-analytics-export.csv"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-dim)] bg-transparent px-3 text-sm font-medium hover:bg-[var(--surface-raised)]"
          >
            {t("exportCsv")}
          </a>
        </div>

        <details className="group rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              {t("filters.toggle")}
              {filtersActive ? (
                <span className="rounded-full bg-[var(--accent-green)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent-green)]">
                  {t("filters.active")}
                </span>
              ) : null}
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 text-[var(--text-muted)] transition-transform duration-200 ease-out group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-3 border-t border-[var(--border-dim)] p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">{t("filters.workspaceId")}</span>
              <input
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder={t("filters.workspacePlaceholder")}
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">{t("filters.session")}</span>
              <select
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              >
                <option value="">{t("filters.allSessions")}</option>
                {sessionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">{t("filters.from")}</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--text-primary)]">{t("filters.to")}</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2"
              />
            </label>
          </div>
        </details>

        {funnelQuery.isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
        ) : funnel ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricChip label={t("metrics.events", { count: funnel.totals.events })} value={funnel.totals.events} />
              <MetricChip
                label={t("metrics.sessions", { count: funnel.totals.sessions })}
                value={funnel.totals.sessions}
              />
              {credit ? (
                <>
                  <MetricChip
                    label={t("metrics.creditBlocks", { count: credit.eventSignals.creditBlockedCount })}
                    value={credit.eventSignals.creditBlockedCount}
                  />
                  <MetricChip
                    label={t("metrics.creditSurprises", { count: credit.eventSignals.surpriseCount })}
                    value={credit.eventSignals.surpriseCount}
                  />
                </>
              ) : null}
            </div>

            <div className="space-y-3">
              <AnalyticsGroup title={t("groups.coreFunnels")} defaultOpen>
                <div className="space-y-3">
                  <FunnelSection title={t("sections.missionConversion")} defaultOpen>
                    <FunnelTable
                      title=""
                      noDataLabel={noDataLabel}
                      headers={[
                        t("columns.mission"),
                        t("columns.entered"),
                        t("columns.completed"),
                        t("columns.rate"),
                      ]}
                      rows={funnel.missionFunnel.map((row) => [
                        <span key="label" className="font-medium text-[var(--text-primary)]">
                          {missionLabel(row.missionKey)}
                        </span>,
                        <CountCell key="entered" value={row.entered} highlight="positive" />,
                        <CountCell key="completed" value={row.completed} highlight="positive" />,
                        <RateCell key="rate" rate={row.conversionRate} />,
                      ])}
                    />
                  </FunnelSection>

                  <FunnelSection title={t("sections.cockpitStage")}>
                    <FunnelTable
                      title=""
                      noDataLabel={noDataLabel}
                      headers={[
                        t("columns.stage"),
                        t("columns.entered"),
                        t("columns.completed"),
                        t("columns.abandoned"),
                      ]}
                      rows={funnel.cockpitStageFunnel.map((row) => [
                        <span key="label" className="font-medium text-[var(--text-primary)]">
                          {stageLabel(row.stage)}
                        </span>,
                        <CountCell key="entered" value={row.entered} highlight="positive" />,
                        <CountCell key="completed" value={row.completed} highlight="positive" />,
                        <CountCell key="abandoned" value={row.abandoned} highlight="warning" />,
                      ])}
                    />
                  </FunnelSection>

                  <FunnelSection title={t("sections.recipeSelection")}>
                    <FunnelTable
                      title=""
                      noDataLabel={noDataLabel}
                      headers={[
                        t("columns.recipe"),
                        t("columns.tradeoffViewed"),
                        t("columns.selected"),
                        t("columns.rate"),
                      ]}
                      rows={(funnel.recipeFunnel ?? []).map((row) => [
                        <span key="label" className="font-medium text-[var(--text-primary)]">
                          {recipeLabel(row.recipeId)}
                        </span>,
                        <CountCell key="viewed" value={row.viewedCount} highlight="positive" />,
                        <CountCell key="selected" value={row.selectedCount} highlight="positive" />,
                        <RateCell
                          key="rate"
                          rate={row.viewedCount > 0 ? row.selectedCount / row.viewedCount : null}
                        />,
                      ])}
                    />
                  </FunnelSection>

                  {funnel.derivationAutoRetryFunnel ? (
                    <FunnelSection title={t("sections.derivationAutoRetry")}>
                      <FunnelTable
                        title={t("sections.derivationAutoRetryOverall")}
                        noDataLabel={noDataLabel}
                        headers={[
                          t("columns.triggered"),
                          t("columns.succeeded"),
                          t("columns.unchanged"),
                          t("columns.rate"),
                        ]}
                        rows={[
                          [
                            <CountCell
                              key="triggered"
                              value={funnel.derivationAutoRetryFunnel.triggered}
                              highlight="positive"
                            />,
                            <CountCell
                              key="succeeded"
                              value={funnel.derivationAutoRetryFunnel.succeeded}
                              highlight="positive"
                            />,
                            <CountCell
                              key="unchanged"
                              value={funnel.derivationAutoRetryFunnel.unchanged}
                              highlight="warning"
                            />,
                            <RateCell
                              key="rate"
                              rate={funnel.derivationAutoRetryFunnel.successRate}
                            />,
                          ],
                        ]}
                      />
                      <FunnelTable
                        title={t("sections.derivationAutoRetryByMode")}
                        noDataLabel={noDataLabel}
                        headers={[
                          t("columns.generationMode"),
                          t("columns.triggered"),
                          t("columns.succeeded"),
                          t("columns.unchanged"),
                          t("columns.rate"),
                        ]}
                        rows={funnel.derivationAutoRetryFunnel.byGenerationMode.map((row) => [
                          <span key="label" className="font-medium text-[var(--text-primary)]">
                            {generationModeLabel(row.generationMode)}
                          </span>,
                          <CountCell key="triggered" value={row.triggered} highlight="positive" />,
                          <CountCell key="succeeded" value={row.succeeded} highlight="positive" />,
                          <CountCell key="unchanged" value={row.unchanged} highlight="warning" />,
                          <RateCell key="rate" rate={row.successRate} />,
                        ])}
                      />
                      <FunnelTable
                        title={t("sections.derivationAutoRetryByFailure")}
                        noDataLabel={noDataLabel}
                        headers={[
                          t("columns.failureCode"),
                          t("columns.triggered"),
                          t("columns.succeeded"),
                          t("columns.unchanged"),
                          t("columns.rate"),
                        ]}
                        rows={funnel.derivationAutoRetryFunnel.byFailureCode.map((row) => [
                          <span key="label" className="font-medium text-[var(--text-primary)]">
                            {row.reasonCode}
                          </span>,
                          <CountCell key="triggered" value={row.triggered} highlight="positive" />,
                          <CountCell key="succeeded" value={row.succeeded} highlight="positive" />,
                          <CountCell key="unchanged" value={row.unchanged} highlight="warning" />,
                          <RateCell key="rate" rate={row.successRate} />,
                        ])}
                      />
                    </FunnelSection>
                  ) : null}

                  <FunnelSection title={t("sections.guidedBriefingAbandon")}>
                    <FunnelTable
                      title=""
                      noDataLabel={noDataLabel}
                      headers={[t("columns.step"), t("columns.abandons")]}
                      rows={(funnel.guidedBriefingAbandonByStep ?? []).map((row) => [
                        <span key="label" className="font-medium text-[var(--text-primary)]">
                          {stepLabel(row.stepId)}
                        </span>,
                        <CountCell key="abandons" value={row.abandonCount} highlight="warning" />,
                      ])}
                    />
                  </FunnelSection>

                  {guidedFlow ? (
                    <>
                      <FunnelSection title={t("sections.guidedFlowPathFunnel")}>
                        <p className="mb-3 text-xs text-[var(--text-secondary)]">
                          {guidedFlow.operationalEvidence?.note}
                        </p>
                        <FunnelTable
                          title=""
                          noDataLabel={noDataLabel}
                          headers={[
                            t("columns.path"),
                            t("columns.entered"),
                            t("columns.completed"),
                            t("columns.abandoned"),
                            t("columns.failures"),
                            t("columns.blocked"),
                          ]}
                          rows={guidedFlow.pathFunnel.map((row) => [
                            <span key="path" className="font-medium text-[var(--text-primary)]">
                              {guidedPathLabel(row.path)}
                            </span>,
                            <CountCell key="starts" value={row.starts} highlight="positive" />,
                            <CountCell key="completed" value={row.completions} highlight="positive" />,
                            <CountCell key="abandoned" value={row.abandonments} highlight="warning" />,
                            <CountCell key="failures" value={row.failures} highlight="warning" />,
                            <CountCell key="blocked" value={row.blocked} highlight="warning" />,
                          ])}
                        />
                      </FunnelSection>

                      <FunnelSection title={t("sections.guidedFlowStepDropoff")}>
                        <FunnelTable
                          title=""
                          noDataLabel={noDataLabel}
                          headers={[
                            t("columns.path"),
                            t("columns.step"),
                            t("columns.entered"),
                            t("columns.dropoffs"),
                          ]}
                          rows={guidedFlow.stepDropoff.map((row) => [
                            <span key="path" className="font-medium text-[var(--text-primary)]">
                              {guidedPathLabel(row.path)}
                            </span>,
                            <span key="step">{stepLabel(row.step)}</span>,
                            <CountCell key="views" value={row.views} highlight="positive" />,
                            <CountCell key="dropoffs" value={row.dropoffs} highlight="warning" />,
                          ])}
                        />
                      </FunnelSection>

                      <FunnelSection title={t("sections.guidedFlowBlockers")}>
                        <FunnelTable
                          title=""
                          noDataLabel={noDataLabel}
                          headers={[t("columns.path"), t("columns.blocker"), t("columns.count")]}
                          rows={guidedFlow.topBlockers.map((row) => [
                            <span key="path">{guidedPathLabel(row.path)}</span>,
                            <span key="blocker">{blockerLabel(row.blockerCategory)}</span>,
                            <CountCell key="count" value={row.count} highlight="warning" />,
                          ])}
                        />
                      </FunnelSection>

                      <FunnelSection title={t("sections.guidedFlowInvestigation")}>
                        <FunnelTable
                          title=""
                          noDataLabel={noDataLabel}
                          headers={[
                            t("columns.thread"),
                            t("columns.path"),
                            t("columns.step"),
                            t("columns.lastEvent"),
                            t("columns.occurredAt"),
                          ]}
                          rows={guidedFlow.investigationLinks.map((row) => [
                            <code key="thread" className="text-xs">
                              {row.threadId}
                            </code>,
                            <span key="path">{guidedPathLabel(row.path)}</span>,
                            <span key="step">{stepLabel(row.lastStep)}</span>,
                            <span key="event" className="text-xs">
                              {row.lastEventKey}
                            </span>,
                            <span key="at" className="text-xs text-[var(--text-secondary)]">
                              {new Date(row.occurredAt).toLocaleString()}
                            </span>,
                          ])}
                        />
                      </FunnelSection>
                    </>
                  ) : null}
                </div>
              </AnalyticsGroup>

              <AnalyticsGroup title={t("groups.credits")}>
                <FunnelTable
                  title={t("sections.creditSpendByStage")}
                  noDataLabel={noDataLabel}
                  headers={[t("columns.stage"), t("columns.creditsSpent"), t("columns.spendEvents")]}
                  rows={(funnel.creditSpendByStage ?? []).map((row) => [
                    stageLabel(row.stage),
                    <CountCell key="credits" value={row.totalCredits} highlight="positive" />,
                    <CountCell key="events" value={row.spendCount} />,
                  ])}
                />
                <div className="grid gap-6 lg:grid-cols-2">
                  <FunnelTable
                    title={t("sections.creditSurprisesByOperation")}
                    noDataLabel={noDataLabel}
                    headers={[
                      t("columns.operation"),
                      t("columns.count"),
                      t("columns.totalDelta"),
                      t("columns.maxDelta"),
                    ]}
                    rows={(funnel.creditSurprisesByOperation ?? []).map((row) => [
                      operationLabel(row.operation),
                      <CountCell key="count" value={row.surpriseCount} highlight="warning" />,
                      row.totalDelta,
                      row.maxAbsDelta,
                    ])}
                  />
                  <FunnelTable
                    title={t("sections.creditSurprisesRecent")}
                    noDataLabel={noDataLabel}
                    headers={[
                      t("columns.operation"),
                      t("columns.estimate"),
                      t("columns.actual"),
                      t("columns.delta"),
                    ]}
                    rows={funnel.creditSurprises.map((row) => [
                      operationLabel(row.operation),
                      row.estimateCredits,
                      row.actualCredits,
                      <span
                        key="delta"
                        className={cn(
                          "tabular-nums",
                          row.delta !== 0 && "font-medium text-[var(--accent-rose)]"
                        )}
                      >
                        {row.delta}
                      </span>,
                    ])}
                  />
                </div>
              </AnalyticsGroup>

              <AnalyticsGroup title={t("groups.sessions")}>
                <FunnelTable
                  title={
                    sessionId ? t("sections.sessionTimeline") : t("sections.sessionTimelineAll")
                  }
                  noDataLabel={noDataLabel}
                  headers={[t("columns.session"), t("columns.stage"), t("columns.completed"), t("columns.gap")]}
                  rows={(funnel.sessionStageTimeline ?? [])
                    .filter((row) => !sessionId || row.sessionId === sessionId)
                    .map((row) => [
                      row.sessionId.slice(0, 8) + "…",
                      stageLabel(row.stage),
                      new Date(row.completedAt).toLocaleString(),
                      formatGapMs(row.gapFromPreviousMs),
                    ])}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">
                      {t("sections.postPreviewStall")}
                    </h4>
                    <dl className="space-y-2 text-xs text-[var(--text-secondary)]">
                      <div className="flex justify-between gap-2">
                        <dt>{t("stall.median")}</dt>
                        <dd className="tabular-nums text-[var(--text-primary)]">
                          {formatGapMs(funnel.postPreviewStall?.medianStallMs ?? null)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("stall.rate")}</dt>
                        <dd>
                          {funnel.postPreviewStall?.stallRate != null ? (
                            <RateCell rate={funnel.postPreviewStall.stallRate} />
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("stall.proceed")}</dt>
                        <dd>
                          {funnel.postPreviewStall?.stallThenProceedRate != null ? (
                            <RateCell rate={funnel.postPreviewStall.stallThenProceedRate} />
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">
                      {t("sections.draftToShare")}
                    </h4>
                    <p className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                      {formatGapMs(funnel.draftToShareTiming?.overallMedianMs ?? null)}
                    </p>
                    <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                      {(funnel.draftToShareTiming?.byAssistanceLevel ?? []).map((row) => (
                        <li key={row.assistanceLevel} className="flex justify-between gap-2">
                          <span>{assistanceLabel(row.assistanceLevel)}</span>
                          <span className="tabular-nums">
                            {formatGapMs(row.medianMs)} ({row.sessionCount})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {(funnel.postPreviewStall?.rows.length ?? 0) > 0 ? (
                  <FunnelTable
                    title={t("sections.activePostPreviewStalls")}
                    noDataLabel={noDataLabel}
                    headers={[
                      t("columns.session"),
                      t("columns.campaign"),
                      t("columns.stall"),
                      t("columns.outcome"),
                    ]}
                    rows={(funnel.postPreviewStall?.rows ?? []).slice(0, 12).map((row) => [
                      row.sessionId.slice(0, 8) + "…",
                      row.campaignId ? row.campaignId.slice(0, 8) + "…" : "—",
                      formatGapMs(row.stallMs),
                      t(`outcomes.${row.outcome}`),
                    ])}
                  />
                ) : null}
              </AnalyticsGroup>

              <AnalyticsGroup title={t("groups.shareReadiness")}>
                <div className="grid gap-6 lg:grid-cols-2">
                  <FunnelTable
                    title={t("sections.shareLinkOpens")}
                    noDataLabel={noDataLabel}
                    headers={[t("columns.campaign"), t("columns.opens")]}
                    rows={(funnel.shareLinkOpens ?? []).map((row) => [
                      row.campaignId.slice(0, 8) + "…",
                      <CountCell key="opens" value={row.openCount} highlight="positive" />,
                    ])}
                  />
                  <FunnelTable
                    title={t("sections.readinessOverridesByDimension")}
                    noDataLabel={noDataLabel}
                    headers={[t("columns.dimension"), t("columns.overrides")]}
                    rows={(funnel.readinessOverrideByDimension ?? []).map((row) => [
                      dimensionLabel(row.dimensionId),
                      <CountCell key="overrides" value={row.overrideCount} highlight="warning" />,
                    ])}
                  />
                </div>

                <FunnelTable
                  title={t("sections.shareOpenByAssistance")}
                  noDataLabel={noDataLabel}
                  headers={[
                    t("columns.assistance"),
                    t("columns.created"),
                    t("columns.opened"),
                    t("columns.rate"),
                  ]}
                  rows={(funnel.shareEngagementByAssistance ?? []).map((row) => [
                    assistanceLabel(row.assistanceLevel),
                    <CountCell key="created" value={row.sessionsWithShareCreated} />,
                    <CountCell key="opened" value={row.sessionsWithShareOpened} highlight="positive" />,
                    <RateCell key="rate" rate={row.openRate} />,
                  ])}
                />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">
                    {t("sections.readinessOverrideSignals")}
                  </h4>
                  {funnel.readinessOverrides.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">{t("signals.none")}</p>
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
                              ? t("signals.operatorNote")
                              : signal.action === "overridden"
                                ? t("signals.overrideEvent")
                                : t("signals.blockedEvent")}{" "}
                            · {stageLabel(signal.stage)}
                          </p>
                          <p className="text-[var(--text-secondary)]">
                            {t("columns.session")} {signal.sessionId.slice(0, 8)}…
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
              </AnalyticsGroup>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t("loadError")}</p>
        )}
      </section>
      <HumanQualityCorpusPanel />
    </div>
  );
}
