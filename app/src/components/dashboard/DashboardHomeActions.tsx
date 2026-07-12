"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Plus } from "lucide-react";
import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import { resolveContinueTarget } from "@/lib/dashboard/resolve-continue-target";
import { buildCreatePostQuickTool } from "@/components/dashboard/quick-tool-recipes";
import { cn } from "@/lib/utils";

const CREATE_HREF = "/campaigns?new=1";

export default function DashboardHomeActions() {
  const t = useTranslations("dashboard.home");
  const tV6 = useTranslations("dashboard.v6");
  const { data: stats, isLoading, isError, refetch } = useDashboardStats("month", "7");

  const continueTarget = useMemo(
    () => resolveContinueTarget(stats?.recentCampaigns ?? []),
    [stats?.recentCampaigns]
  );

  const createPost = useMemo(
    () => buildCreatePostQuickTool((key) => tV6(key)),
    [tV6]
  );

  if (isError && !stats) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t("errorTitle")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t("errorDescription")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-4">
        <h1 className="sr-only">{t("title")}</h1>

        <Link
          href={CREATE_HREF}
          className={cn(
            "flex w-full items-center justify-between gap-4 rounded-[var(--radius-object)] border border-[var(--border-default)]",
            "bg-[var(--accent-primary)] px-6 py-5 text-left transition-colors",
            "hover:bg-[var(--accent-primary-hover)]"
          )}
        >
          <span className="flex items-center gap-3">
            <Plus size={20} aria-hidden="true" className="text-[var(--text-on-accent)]" />
            <span className="text-base font-semibold text-[var(--text-on-accent)]">
              {t("createCampaign")}
            </span>
          </span>
          <ArrowRight size={18} aria-hidden="true" className="text-[var(--text-on-accent)] opacity-80" />
        </Link>

        {isLoading && !stats ? (
          <div
            className="h-[4.5rem] w-full animate-pulse rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
            aria-hidden="true"
          />
        ) : continueTarget.kind === "campaign" ? (
          <Link
            href={continueTarget.href}
            className={cn(
              "flex w-full flex-col gap-1 rounded-[var(--radius-object)] border border-[var(--border-default)]",
              "bg-[var(--surface-raised)] px-6 py-5 text-left transition-colors",
              "hover:bg-[var(--surface-inset)]"
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-[var(--text-primary)]">
                {t("continueWhereLeftOff")}
              </span>
              <ArrowRight size={18} aria-hidden="true" className="text-[var(--text-muted)]" />
            </span>
            <span className="truncate text-sm text-[var(--text-secondary)]">
              {t("continueCampaignHint", { name: continueTarget.name })}
            </span>
          </Link>
        ) : (
          <div
            className={cn(
              "rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)]",
              "bg-[var(--surface-base)] px-6 py-5"
            )}
          >
            <p className="text-base font-medium text-[var(--text-secondary)]">
              {t("continueWhereLeftOff")}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t("continueEmpty")}</p>
          </div>
        )}

        <section aria-labelledby="home-quick-tools-heading" className="pt-2">
          <h2
            id="home-quick-tools-heading"
            className="mb-3 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
          >
            {t("quickToolsTitle")}
          </h2>
          <Link
            href={createPost.href}
            className={cn(
              "flex w-full items-center gap-3 rounded-[var(--radius-object)] border border-[var(--border-default)]",
              "bg-[var(--surface-raised)] p-4 text-left transition-colors",
              "hover:bg-[var(--surface-inset)]"
            )}
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary-subtle)] text-base"
              aria-hidden="true"
            >
              {createPost.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">
                {createPost.name}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{createPost.desc}</span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
              {createPost.count}
            </span>
            <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
          </Link>
        </section>
      </div>
    </div>
  );
}
