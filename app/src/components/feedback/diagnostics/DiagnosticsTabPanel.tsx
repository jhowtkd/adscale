"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type {
  DiagnosticWorkState,
  DiagnosticWorkSummary,
  DiagnosticWorksSort,
  GetWorkDiagnosticsResultMirror,
  ListDiagnosticWorksResult,
} from "@/lib/diagnostics/types";
import { DIAGNOSTIC_STAGES } from "@/lib/diagnostics/types";
import { callIds } from "@/lib/diagnostics/timeline-model";
import {
  ownerButtonClass,
  ownerFieldClass,
  ownerListItemClass,
} from "@/components/feedback/owner-chrome";
import { DiagnosticCallPanel } from "./DiagnosticCallPanel";
import { DiagnosticsLinks, SupportCodeButton } from "./DiagnosticsLinks";
import { DiagnosticsTimeline } from "./DiagnosticsTimeline";

export const DIAGNOSTIC_WORK_STATES: readonly DiagnosticWorkState[] = [
  "failed",
  "completed",
  "unconfirmed",
  "partial",
] as const;

export interface DiagnosticsFilters {
  workspaceId: string;
  workItemId: string;
  from: string;
  to: string;
  stage: string;
  provider: string;
  model: string;
  state: string;
  sort: DiagnosticWorksSort;
}

const EMPTY_FILTERS: DiagnosticsFilters = {
  workspaceId: "",
  workItemId: "",
  from: "",
  to: "",
  stage: "",
  provider: "",
  model: "",
  state: "",
  sort: "recent",
};

function retryDiagnosticsQuery(failureCount: number, error: unknown) {
  return !(error instanceof Error && error.message === "forbidden") && failureCount < 1;
}

export async function fetchDiagnosticWorks(
  filters: DiagnosticsFilters,
  cursor?: string,
  limit = 25,
): Promise<ListDiagnosticWorksResult> {
  const params = new URLSearchParams({ sort: filters.sort, limit: String(limit) });
  if (filters.workspaceId) params.set("workspaceId", filters.workspaceId);
  if (filters.workItemId) params.set("workItemId", filters.workItemId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.model) params.set("model", filters.model);
  if (filters.state) params.set("state", filters.state);
  if (cursor) params.set("cursor", cursor);
  const res = await apiFetch(`/api/feedback/diagnostics/works?${params.toString()}`);
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as ListDiagnosticWorksResult;
}

export async function fetchWorkDiagnostics(
  workspaceId: string,
  workItemId: string,
): Promise<GetWorkDiagnosticsResultMirror> {
  const params = new URLSearchParams({ workspaceId });
  const res = await apiFetch(
    `/api/feedback/diagnostics/works/${encodeURIComponent(workItemId)}?${params.toString()}`,
  );
  if (res.status === 403) throw new Error("forbidden");
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as GetWorkDiagnosticsResultMirror;
}

/**
 * Diagnóstico tab: read-only Trabalho journey for the platform owner.
 * All queries stay behind `enabled: isPlatformOwner`; a 403 renders the
 * forbidden state without retrying. Never generates, charges, approves
 * or retries anything.
 */
export function DiagnosticsTabPanel({
  isPlatformOwner,
}: {
  isPlatformOwner: boolean;
}) {
  const t = useTranslations("feedback.triage.diagnostics");
  const [draft, setDraft] = useState<DiagnosticsFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DiagnosticsFilters>(EMPTY_FILTERS);
  const [cursor, setCursor] = useState<string | null>(null);
  const [works, setWorks] = useState<DiagnosticWorkSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<DiagnosticWorkSummary | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["diagnostic-works", applied, cursor],
    queryFn: () => fetchDiagnosticWorks(applied, cursor ?? undefined),
    retry: retryDiagnosticsQuery,
    enabled: isPlatformOwner,
  });

  // Merge each fetched page into the accumulated list during render (React's
  // "adjust state when props change" pattern): keyed on page identity, so a
  // new page after a cursor change appends and a fresh filter search (which
  // resets works/cursor) replaces. No effect, no cascading renders.
  const [lastMergedPage, setLastMergedPage] =
    useState<ListDiagnosticWorksResult | null>(null);
  if (listQuery.data && listQuery.data !== lastMergedPage) {
    const page = listQuery.data;
    setLastMergedPage(page);
    setNextCursor(page.nextCursor);
    if (cursor === null) {
      setWorks(page.works);
    } else {
      // Dedupe by id: a retry on a cursor page refetches the same works as
      // a new page object, and must not append them twice.
      setWorks((current) => {
        const seen = new Set(current.map((work) => work.workItemId));
        return [...current, ...page.works.filter((work) => !seen.has(work.workItemId))];
      });
    }
  }

  const detailQuery = useQuery({
    queryKey: ["diagnostic-work", selected?.workspaceId, selected?.workItemId],
    queryFn: () => fetchWorkDiagnostics(selected!.workspaceId, selected!.workItemId),
    retry: retryDiagnosticsQuery,
    enabled: isPlatformOwner && selected !== null,
  });

  const applyFilters = (filters: DiagnosticsFilters) => {
    setLastMergedPage(null);
    setApplied(filters);
    setCursor(null);
    setWorks([]);
    setNextCursor(null);
    setSelected(null);
    setSelectedCallId(null);
  };

  const forbidden =
    (listQuery.error instanceof Error && listQuery.error.message === "forbidden") ||
    (detailQuery.error instanceof Error && detailQuery.error.message === "forbidden");

  if (!isPlatformOwner || forbidden) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{t("forbidden")}</p>
    );
  }

  const set = (key: keyof DiagnosticsFilters) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const detail = detailQuery.data;
  const detailCalls =
    detail && detail.found && detail.telemetry.status === "ok"
      ? callIds(detail.telemetry.events)
      : [];

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("description")}
        </p>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(draft);
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.workItemId")}
          </span>
          <input
            type="text"
            value={draft.workItemId}
            onChange={(event) => set("workItemId")(event.target.value)}
            aria-label={t("filters.workItemId")}
            className={ownerFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.workspace")}
          </span>
          <input
            type="text"
            value={draft.workspaceId}
            onChange={(event) => set("workspaceId")(event.target.value)}
            aria-label={t("filters.workspace")}
            className={ownerFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.stage")}
          </span>
          <select
            value={draft.stage}
            onChange={(event) => set("stage")(event.target.value)}
            aria-label={t("filters.stage")}
            className={ownerFieldClass}
          >
            <option value="">{t("filters.allStages")}</option>
            {DIAGNOSTIC_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.provider")}
          </span>
          <input
            type="text"
            value={draft.provider}
            onChange={(event) => set("provider")(event.target.value)}
            aria-label={t("filters.provider")}
            className={ownerFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.model")}
          </span>
          <input
            type="text"
            value={draft.model}
            onChange={(event) => set("model")(event.target.value)}
            aria-label={t("filters.model")}
            className={ownerFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.state")}
          </span>
          <select
            value={draft.state}
            onChange={(event) => set("state")(event.target.value)}
            aria-label={t("filters.state")}
            className={ownerFieldClass}
          >
            <option value="">{t("filters.allStates")}</option>
            {DIAGNOSTIC_WORK_STATES.map((state) => (
              <option key={state} value={state}>
                {t(`states.${state}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.from")}
          </span>
          <input
            type="datetime-local"
            value={draft.from}
            onChange={(event) => set("from")(event.target.value)}
            aria-label={t("filters.from")}
            className={ownerFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.to")}
          </span>
          <input
            type="datetime-local"
            value={draft.to}
            onChange={(event) => set("to")(event.target.value)}
            aria-label={t("filters.to")}
            className={ownerFieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--text-primary)]">
            {t("filters.sort")}
          </span>
          <select
            value={draft.sort}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sort: event.target.value as DiagnosticWorksSort,
              }))
            }
            aria-label={t("filters.sort")}
            className={ownerFieldClass}
          >
            <option value="recent">{t("filters.sortRecent")}</option>
            <option value="oldest">{t("filters.sortOldest")}</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className={ownerButtonClass}
          >
            {t("filters.search")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={ownerButtonClass}
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              applyFilters(EMPTY_FILTERS);
            }}
          >
            {t("filters.clear")}
          </Button>
        </div>
      </form>

      {listQuery.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]"
        >
          <span>{t("loadError")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void listQuery.refetch()}
            className={ownerButtonClass}
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          {listQuery.isLoading && works.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
          ) : works.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("empty")}</p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {works.map((work) => (
                <button
                  key={`${work.workspaceId}/${work.workItemId}`}
                  type="button"
                  onClick={() => {
                    setSelected(work);
                    setSelectedCallId(null);
                  }}
                  className={ownerListItemClass(
                    selected?.workItemId === work.workItemId &&
                      selected?.workspaceId === work.workspaceId,
                  )}
                >
                  <span className="block truncate font-mono text-xs text-[var(--text-primary)]">
                    {work.workItemId}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    {t("listMeta", {
                      count: work.eventCount,
                      states: work.states
                        .map((state) => t(`states.${state}`))
                        .join(", "),
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    {new Date(work.lastSeen).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
          {nextCursor ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={listQuery.isFetching}
              onClick={() => setCursor(nextCursor)}
              className={ownerButtonClass}
            >
              {listQuery.isFetching ? t("loading") : t("loadMore")}
            </Button>
          ) : null}
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto">
          {!selected ? (
            <p className="text-sm text-[var(--text-muted)]">
              {t("selectWork")}
            </p>
          ) : detailQuery.isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
          ) : detailQuery.error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]"
            >
              <span>{t("loadError")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void detailQuery.refetch()}
                className={ownerButtonClass}
              >
                {t("retry")}
              </Button>
            </div>
          ) : detail && !detail.found ? (
            <p className="text-sm text-[var(--text-muted)]">{t("notFound")}</p>
          ) : detail && detail.found ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ownerButtonClass}
                  onClick={() => {
                    setSelected(null);
                    setSelectedCallId(null);
                  }}
                >
                  {t("back")}
                </Button>
                <SupportCodeButton value={detail.work.workItemId} />
              </div>

              <section
                aria-label={t("canonicalTitle")}
                className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("canonicalTitle")}
                  </h3>
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {t("canonicalOrigin")}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-primary)]">
                  {detail.work.title}
                </p>
                <dl className="grid gap-1 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
                  <p>
                    {t("status")}: {detail.work.status ?? t("unknown")}
                  </p>
                  <p>
                    {t("outputs")}: {detail.work.outputs.length}
                  </p>
                  <p>
                    {t("updatedAt")}:{" "}
                    {new Date(detail.work.updatedAt).toLocaleString()}
                  </p>
                  <p>{t("deliveryNotRecorded")}</p>
                </dl>
              </section>

              <section aria-label={t("telemetryTitle")} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("telemetryTitle")}
                  </h3>
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {t("telemetryOrigin")}
                  </span>
                  {detail.telemetry.partial ? (
                    <span
                      data-testid="diagnostics-badge-partial"
                      className="rounded-full bg-[var(--warning-bg)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--warning-text)]"
                    >
                      {t("states.partial")}
                    </span>
                  ) : null}
                </div>
                {detail.telemetry.status === "unavailable" ? (
                  <p
                    role="note"
                    className="rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]"
                  >
                    {t("telemetryUnavailable")}
                  </p>
                ) : (
                  <>
                    <DiagnosticsTimeline events={detail.telemetry.events} />
                    {detail.telemetry.nextCursor ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        {t("moreEvents")}
                      </p>
                    ) : null}
                  </>
                )}
              </section>

              <section aria-label={t("linksTitle")} className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("linksTitle")}
                </h3>
                <DiagnosticsLinks links={detail.links.items} />
              </section>

              {detailCalls.length > 0 && selected ? (
                <section aria-label={t("callTitle")} className="space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("callTitle")}
                  </h3>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-[var(--text-primary)]">
                      {t("selectCall")}
                    </span>
                    <select
                      value={selectedCallId ?? ""}
                      onChange={(event) =>
                        setSelectedCallId(event.target.value || null)
                      }
                      aria-label={t("selectCall")}
                      className={ownerFieldClass}
                    >
                      <option value="">{t("selectCallPlaceholder")}</option>
                      {detailCalls.map((callId) => (
                        <option key={callId} value={callId}>
                          {callId}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedCallId ? (
                    <DiagnosticCallPanel
                      workspaceId={selected.workspaceId}
                      workItemId={selected.workItemId}
                      callId={selectedCallId}
                      isPlatformOwner={isPlatformOwner}
                    />
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
