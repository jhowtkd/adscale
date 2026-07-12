"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import DashboardV6View from "@/components/dashboard/v6/DashboardV6View";
import {
  buildDashboardV6Greeting,
  buildDashboardV6Labels,
} from "@/components/dashboard/v6/build-dashboard-v6-labels";
import { mapDashboardToV6View } from "@/components/dashboard/v6/map-dashboard-v6";
import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import { useTemplates } from "@/lib/hooks/use-templates";
import { useAppStore } from "@/lib/store";

const BRIEFING_KEYS = {
  objective: "briefingObjective",
  audience: "briefingAudience",
  tone: "briefingTone",
  platforms: "briefingPlatforms",
  cta: "briefingCta",
  constraints: "briefingConstraints",
} as const;

export default function DashboardDataPage() {
  const tV6 = useTranslations("dashboard.v6");
  const tKpi = useTranslations("dashboard.kpi");
  const tStatus = useTranslations("campaign.status");
  const tHome = useTranslations("dashboard.home");
  const firstName = useAppStore((s) => s.user.firstName);
  const { data: stats, isLoading, isError, refetch } = useDashboardStats("month", "7");
  const { data: templates = [], isLoading: templatesLoading } = useTemplates();

  const labels = useMemo(
    () => ({
      ...buildDashboardV6Labels(tV6),
      greeting: buildDashboardV6Greeting(tV6, firstName || "User"),
    }),
    [tV6, firstName]
  );

  const view = useMemo(() => {
    if (!stats) return null;
    return mapDashboardToV6View({
      stats,
      firstName: firstName || "User",
      templates,
      tKpi,
      tStatus,
      tHero: tV6,
      tBriefing: (key) => tV6(BRIEFING_KEYS[key]),
      tRelative: {
        now: tV6("relativeNow"),
        minutes: (count) => tV6("relativeMinutes", { count }),
        hours: (count) => tV6("relativeHours", { count }),
        oneDay: tV6("relativeOneDay"),
        days: (count) => tV6("relativeDays", { count }),
      },
      authorName: firstName || "User",
      templateFallback: tV6("templateFallback"),
      varsCount: (count) => tV6("varsCount", { count }),
    });
  }, [stats, templates, firstName, tKpi, tStatus, tV6]);

  if (isError && !stats) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{tHome("errorTitle")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{tHome("errorDescription")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]"
        >
          {tHome("retry")}
        </button>
      </div>
    );
  }

  const loading = isLoading || templatesLoading || !view;

  const summary = view ? (
    <>
      {tV6.rich("summary", {
        inReview: (chunks) => (
          <strong className="text-[var(--text-primary)]">
            {tV6("summaryInReview", { count: view.inReviewCount })}
            {chunks}
          </strong>
        ),
        ready: (chunks) => (
          <strong className="text-[var(--accent-primary-text)]">
            {tV6("summaryReady", { count: view.readyToApproveCount })}
            {chunks}
          </strong>
        ),
      })}
    </>
  ) : null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <DashboardV6View
        view={
          view ?? {
            firstName: firstName || "User",
            inReviewCount: 0,
            readyToApproveCount: 0,
            kpis: [],
            hero: null,
            activity: [],
            recipes: [],
            briefingRows: [],
            activeBriefingCampaignId: null,
          }
        }
        labels={labels}
        summary={summary}
        isLoading={loading}
        interactive
      />
    </div>
  );
}
