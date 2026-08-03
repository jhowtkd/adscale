"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { FactualIssueAlert } from "@/server/human-quality/calibration/types";

const factualAlertsQueryKey = (workspaceId?: string, clientProfileId?: string) =>
  ["factual-alerts", workspaceId, clientProfileId] as const;

export async function fetchFactualAlerts(
  workspaceId?: string,
  clientProfileId?: string
): Promise<FactualIssueAlert[] | null> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (clientProfileId) params.set("clientProfileId", clientProfileId);
  const query = params.toString();
  const path = `/api/admin/quality/learning/factual-alerts${query ? `?${query}` : ""}`;
  const res = await apiFetch(path);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  const data = (await res.json()) as { alerts: FactualIssueAlert[] };
  return data.alerts;
}

export function FactualAlertsPanel({
  workspaceId,
  clientProfileId,
  variant = "workspace",
}: {
  workspaceId?: string;
  clientProfileId?: string;
  variant?: "workspace" | "brand";
}) {
  const alertsQuery = useQuery({
    queryKey: factualAlertsQueryKey(workspaceId, clientProfileId),
    queryFn: () => fetchFactualAlerts(workspaceId, clientProfileId),
    retry: false,
  });

  if (alertsQuery.isFetched && alertsQuery.data === null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Factual issue alerts are restricted to platform owners.
      </p>
    );
  }

  if (alertsQuery.isLoading) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Loading factual issue alerts…</p>
    );
  }

  if (alertsQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Unable to load factual issue alerts.</p>
    );
  }

  const alerts = alertsQuery.data ?? [];
  const isBrandVariant = variant === "brand";

  return (
    <section
      data-testid="factual-alerts-panel"
      className="space-y-3 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isBrandVariant ? "Alertas de problema factual" : "Factual issue alerts"}
          </h3>
          <span className="rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--warning-text)]">
            Factual guard — not a calibration rule
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          {isBrandVariant ? (
            <>
              Estes recortes falharam na revisão do factual guard e{" "}
              <strong>não devem</strong> ser aceitos como regras de prompt{" "}
              <code className="text-[10px]">corpus_quality</code>. Revise manualmente os itens
              do corpus e a evidência factual.
            </>
          ) : (
            <>
              These slices failed factual guard review and{" "}
              <strong>must not</strong> be accepted as{" "}
              <code className="text-[10px]">corpus_quality</code> prompt rules. Review corpus
              items and factual evidence manually.
            </>
          )}
        </p>
      </div>

      {alerts.length === 0 ? (
        <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
          No factual issue slices meet alert thresholds.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Slice</th>
                <th className="px-2 py-1.5 text-left font-medium">Workspace</th>
                <th className="px-2 py-1.5 text-left font-medium">Brand</th>
                <th className="px-2 py-1.5 text-left font-medium">Rationale</th>
                <th className="px-2 py-1.5 text-left font-medium">Stats</th>
                <th className="px-2 py-1.5 text-left font-medium">Corpus items</th>
                <th className="px-2 py-1.5 text-left font-medium">Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => {
                const { stats, corpusItemIds, artifactIds } = alert.evidenceRefs;
                return (
                  <tr
                    key={`${alert.workspaceId}-${alert.clientProfileId}-${alert.sliceKey}`}
                    className="border-t border-[var(--border-dim)]"
                  >
                    <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[10px]">
                      {alert.sliceKey}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">{alert.workspaceId}</td>
                    <td className="px-2 py-1.5">
                      <a
                        href={`/admin/quality/brands/${alert.clientProfileId}`}
                        className="font-mono text-[10px] text-[var(--text-primary)] underline underline-offset-2"
                      >
                        {alert.clientProfileId}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-[var(--text-secondary)]">{alert.rationale}</td>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--text-secondary)]">
                      <div>count: {stats.count}</div>
                      <div>meanSignedDelta: {stats.meanSignedDelta}</div>
                      <div>meanAbsError: {stats.meanAbsError}</div>
                      <div>over: {stats.overScoreCount}</div>
                      <div>under: {stats.underScoreCount}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <ul className="space-y-0.5">
                        {corpusItemIds.map((corpusItemId) => (
                          <li key={corpusItemId}>
                            <a
                              href="/feedback"
                              className="font-mono text-[10px] text-[var(--text-primary)] underline underline-offset-2"
                            >
                              {corpusItemId}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                      {artifactIds && artifactIds.length > 0
                        ? `${artifactIds.length} artifacts referenced`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
