"use client";

import React, { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChartCard } from "./ChartCard";
import { CheckCircle2, Clock, TrendingUp, Zap } from "lucide-react";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { cn } from "@/lib/utils";

interface AnalyticsSectionProps {
  campaigns: UiCampaign[];
  isLoading: boolean;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  change?: { value: string; positive: boolean };
  delay?: number;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 animate-fade-in transition-all duration-250 hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md"
          style={{ backgroundColor: "var(--accent-mint-dim)" }}
        >
          <Icon size={18} style={{ color: "var(--accent-mint)" }} />
        </div>
        <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] font-mono uppercase">
          {label}
        </p>
      </div>
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)] mb-1 font-mono">
        {value}
      </p>
      {change && (
        <div className="flex items-center gap-1 text-[13px]">
          <span
            className={cn(
              change.positive ? "text-[var(--accent-teal)]" : "text-[var(--accent-amber)]"
            )}
          >
            {change.positive ? "▲" : "▼"} {change.value}
          </span>
        </div>
      )}
    </div>
  );
}

function VerticalBarChart({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-3 h-40">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full flex items-end justify-center h-32">
            <div
              className="w-full max-w-[32px] rounded-t-sm transition-all duration-500"
              style={{
                height: `${(item.value / max) * 100}%`,
                backgroundColor: item.color || "var(--accent-mint)",
                opacity: 0.85,
              }}
            />
          </div>
          <span className="text-[10px] font-medium text-[var(--text-muted)] font-mono text-center leading-tight">
            {item.label}
          </span>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] font-mono">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBarChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--text-secondary)] font-mono">{item.label}</span>
            <span className="font-semibold text-[var(--text-primary)] font-mono">{item.value}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsSection({ campaigns, isLoading }: AnalyticsSectionProps) {
  const t = useTranslations("analytics");
  const tc = useTranslations("common");
  const locale = useLocale();

  const metrics = useMemo(() => {
    const totalDerivations = campaigns.reduce((s, c) => s + c.totalDerivations, 0);
    const completedDerivations = campaigns.reduce((s, c) => s + c.completedDerivations, 0);
    const activeDerivations = campaigns.reduce((s, c) => s + c.activeDerivations, 0);
    const failedDerivations = campaigns.reduce((s, c) => s + c.failedDerivations, 0);
    const totalCredits = campaigns.reduce((s, c) => s + c.creditsUsed, 0);

    const approvalRate = totalDerivations > 0 ? Math.round((completedDerivations / totalDerivations) * 100) : 0;
    const creditEfficiency = totalCredits > 0 ? (completedDerivations / totalCredits).toFixed(2) : "0";

    // Month-over-month using campaign creation dates
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const thisMonthCount = campaigns.filter((c) => {
      const d = c.createdAt;
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const lastMonthCount = campaigns.filter((c) => {
      const d = c.createdAt;
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).length;

    const momChange =
      lastMonthCount > 0
        ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
        : thisMonthCount > 0
          ? 100
          : 0;

    // Credits by month (last 6 months)
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(locale, { month: "short" });
      const value = campaigns
        .filter((c) => {
          const cd = c.createdAt;
          return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}` === key;
        })
        .reduce((s, c) => s + c.creditsUsed, 0);
      months.push({ label, value });
    }

    // Top campaigns by completed derivations
    const topCampaigns = [...campaigns]
      .sort((a, b) => b.completedDerivations - a.completedDerivations)
      .slice(0, 5);

    return {
      approvalRate,
      activeDerivations,
      creditEfficiency,
      momChange,
      momPositive: momChange >= 0,
      months,
      statusData: [
        { label: t("statusCompleted"), value: completedDerivations, color: "var(--accent-mint)" },
        { label: t("statusActive"), value: activeDerivations, color: "var(--accent-amber)" },
        { label: t("statusFailed"), value: failedDerivations, color: "var(--accent-rose)" },
      ],
      topCampaigns,
      totalDerivations,
      totalCredits,
    };
  }, [campaigns, t]);

  if (isLoading) {
    return (
      <section className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 animate-pulse"
            >
              <div className="h-9 w-9 rounded-md bg-[var(--surface-raised)] mb-4" />
              <div className="h-4 w-24 bg-[var(--surface-raised)] rounded mb-2" />
              <div className="h-7 w-16 bg-[var(--surface-raised)] rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 animate-pulse h-64"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          icon={CheckCircle2}
          label={t("approvalRate")}
          value={`${metrics.approvalRate}%`}
          change={
            metrics.totalDerivations > 0
              ? { value: `${metrics.approvalRate}%`, positive: metrics.approvalRate >= 50 }
              : undefined
          }
          delay={0}
        />
        <KpiCard
          icon={Clock}
          label={t("activeDerivations")}
          value={metrics.activeDerivations}
          delay={80}
        />
        <KpiCard
          icon={Zap}
          label={t("creditEfficiency")}
          value={metrics.creditEfficiency}
          delay={160}
        />
        <KpiCard
          icon={TrendingUp}
          label={t("monthOverMonth")}
          value={`${Math.abs(metrics.momChange)}%`}
          change={
            campaigns.length > 0
              ? { value: `${Math.abs(metrics.momChange)}%`, positive: metrics.momPositive }
              : undefined
          }
          delay={240}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t("creditsByMonth")} delay={320}>
          {metrics.months.some((m) => m.value > 0) ? (
            <VerticalBarChart data={metrics.months} />
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-[var(--text-muted)] font-mono">
              {t("noData")}
            </div>
          )}
        </ChartCard>

        <ChartCard title={t("derivationsByStatus")} delay={400}>
          {metrics.totalDerivations > 0 ? (
            <HorizontalBarChart data={metrics.statusData} />
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-[var(--text-muted)] font-mono">
              {t("noData")}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Top Campaigns */}
      <ChartCard title={t("topCampaigns")} delay={480}>
        {metrics.topCampaigns.length > 0 ? (
          <div className="space-y-3">
            {metrics.topCampaigns.map((campaign, i) => (
              <div
                key={campaign.id}
                className="flex items-center justify-between py-2 border-b border-[var(--border-dim)] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[10px] font-bold text-[var(--text-muted)] font-mono">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)] font-mono">
                      {campaign.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] font-mono">
                      {campaign.completedDerivations} {tc("derivations").toLowerCase()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[var(--text-primary)] font-mono">
                    {campaign.completedDerivations}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] font-mono">
                    {t("approved")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-24 text-sm text-[var(--text-muted)] font-mono">
            {t("noData")}
          </div>
        )}
      </ChartCard>
    </section>
  );
}
