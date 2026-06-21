"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AdminDashboardSummary } from "@/server/repositories/admin-dashboard";

type KpiCardProps = {
  href: string;
  label: string;
  value: number;
};

function KpiCard({ href, label, value }: KpiCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 transition-colors",
        "hover:border-[var(--accent-green)] hover:bg-[var(--surface-raised)]"
      )}
    >
      <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">
        {value.toLocaleString()}
      </p>
    </Link>
  );
}

function AttentionList({
  title,
  emptyLabel,
  items,
  renderItem,
}: {
  title: string;
  emptyLabel: string;
  items: unknown[];
  renderItem: (item: never, index: number) => ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-2">{items.map(renderItem)}</div>
      )}
    </section>
  );
}

export default function DashboardSummary() {
  const t = useTranslations("admin.dashboard");

  const summaryQuery = useQuery({
    queryKey: ["admin", "dashboard", "summary"],
    queryFn: async (): Promise<AdminDashboardSummary> => {
      const res = await apiFetch("/api/admin/dashboard/summary");
      if (!res.ok) {
        throw new Error("Failed to load dashboard summary");
      }
      return res.json();
    },
  });

  if (summaryQuery.isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>;
  }

  const summary = summaryQuery.data;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          href="/admin/users?active=7d"
          label={t("kpis.activeUsers")}
          value={summary.activeUsers7d}
        />
        <KpiCard
          href="/admin/feedbacks?status=new"
          label={t("kpis.pendingFeedbacks")}
          value={summary.pendingFeedbacks}
        />
        <KpiCard
          href="/admin/quality/queue"
          label={t("kpis.corpusPending")}
          value={summary.corpusPending}
        />
        <KpiCard
          href="/admin/feedbacks?category=generation"
          label={t("kpis.failedDerivations")}
          value={summary.failedDerivations24h}
        />
      </div>

      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          {t("attention.title")}
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <AttentionList
            title={t("attention.criticalFeedbacks")}
            emptyLabel={t("attention.empty")}
            items={summary.attention.criticalFeedbacks}
            renderItem={(item) => (
              <Link
                key={item.id}
                href="/admin/feedbacks?status=new"
                className="block rounded-lg border border-[var(--border-dim)] px-3 py-2 text-sm hover:bg-[var(--surface-raised)]"
              >
                <p className="line-clamp-2 text-[var(--text-primary)]">{item.message}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </Link>
            )}
          />

          <AttentionList
            title={t("attention.zeroCreditUsers")}
            emptyLabel={t("attention.empty")}
            items={summary.attention.zeroCreditUsers}
            renderItem={(item) => (
              <Link
                key={item.userId}
                href="/admin/users?credits=zero"
                className="block rounded-lg border border-[var(--border-dim)] px-3 py-2 text-sm hover:bg-[var(--surface-raised)]"
              >
                <p className="font-medium text-[var(--text-primary)]">{item.email}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{item.workspaceId}</p>
              </Link>
            )}
          />

          <AttentionList
            title={t("attention.staleCorpusItems")}
            emptyLabel={t("attention.empty")}
            items={summary.attention.staleCorpusItems}
            renderItem={(item) => (
              <Link
                key={item.id}
                href="/admin/quality/queue"
                className="block rounded-lg border border-[var(--border-dim)] px-3 py-2 text-sm hover:bg-[var(--surface-raised)]"
              >
                <p className="font-mono text-xs text-[var(--text-primary)]">{item.id}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {new Date(item.selectedAt).toLocaleString()}
                </p>
              </Link>
            )}
          />
        </div>
      </div>
    </div>
  );
}
