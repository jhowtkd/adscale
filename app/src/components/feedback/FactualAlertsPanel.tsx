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
      className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isBrandVariant ? "Alertas de problema factual" : "Factual issue alerts"}
          </h3>
          <span className="rounded border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
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
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={`${alert.workspaceId}-${alert.clientProfileId}-${alert.sliceKey}`}
              className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-xs"
            >
              <p className="font-mono text-[10px]">{alert.sliceKey}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
