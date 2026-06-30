"use client";

import { authClient } from "@/lib/auth-client";
import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useTemplates } from "@/lib/hooks/use-templates";
import { useAppStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import DashboardV6View from "@/components/dashboard/v6/DashboardV6View";
import {
  buildDashboardV6Greeting,
  buildDashboardV6Labels,
} from "@/components/dashboard/v6/build-dashboard-v6-labels";
import { mapDashboardToV6View } from "@/components/dashboard/v6/map-dashboard-v6";

const OnboardingTour = dynamic(
  () => import("@/components/dashboard/OnboardingTour").then((mod) => mod.OnboardingTour),
  {
    loading: () => null,
    ssr: false,
  },
);

export default function DashboardPage() {
  const tV6 = useTranslations("dashboard.v6");
  const tKpi = useTranslations("dashboard.kpi");
  const tStatus = useTranslations("campaign.status");
  const tOnboarding = useTranslations("onboarding");
  const period = "month" as const;
  const creditRange = "7" as const;
  const { data: stats, isLoading, isFetching, error } = useDashboardStats(period, creditRange);
  const { data: templates = [] } = useTemplates();
  const { data: session } = authClient.useSession();
  const user = useAppStore((s) => s.user);

  const statsPending = isLoading && !stats;

  const { completed: onboardingCompleted, isLoading: isOnboardingLoading, complete: completeOnboarding } =
    useOnboarding();

  const sessionUser = session?.user;
  const displayName =
    sessionUser?.name?.trim() || `${user.firstName} ${user.lastName}`.trim() || sessionUser?.email || user.email;
  const firstName = sessionUser?.name?.split(" ")[0] || user.firstName || "User";

  const labels = useMemo(
    () => ({
      ...buildDashboardV6Labels(tV6),
      greeting: buildDashboardV6Greeting(tV6, firstName),
    }),
    [tV6, firstName],
  );

  const viewModel = useMemo(() => {
    if (!stats) return null;
    return mapDashboardToV6View({
      stats,
      firstName,
      templates,
      tKpi,
      tStatus,
      tHero: (key, values) => tV6(key, values),
      tBriefing: (key) =>
        tV6(
          key === "objective"
            ? "briefingObjective"
            : key === "audience"
              ? "briefingAudience"
              : key === "tone"
                ? "briefingTone"
                : key === "platforms"
                  ? "briefingPlatforms"
                  : key === "cta"
                    ? "briefingCta"
                    : "briefingConstraints",
        ),
      tRelative: {
        now: tV6("relativeNow"),
        minutes: (count) => tV6("relativeMinutes", { count }),
        hours: (count) => tV6("relativeHours", { count }),
        oneDay: tV6("relativeOneDay"),
        days: (count) => tV6("relativeDays", { count }),
      },
      authorName: displayName,
      templateFallback: tV6("templateFallback"),
      varsCount: (count) => tV6("varsCount", { count }),
    });
  }, [stats, firstName, templates, tKpi, tStatus, tV6, displayName]);

  const summary = useMemo(() => {
    if (!viewModel) return null;
    return tV6.rich("summary", {
      inReview: () => (
        <strong className="text-[var(--text-primary)]">
          {tV6("summaryInReview", { count: viewModel.inReviewCount })}
        </strong>
      ),
      ready: () => (
        <strong className="text-[var(--accent-primary-text)]">
          {tV6("summaryReady", { count: viewModel.readyToApproveCount })}
        </strong>
      ),
    });
  }, [tV6, viewModel]);

  const tourSteps = [
    {
      target: '[data-tour-step="1"]',
      title: tOnboarding("step1Title"),
      description: tOnboarding("step1Desc"),
      placement: "bottom" as const,
    },
    {
      target: '[data-tour-step="2"]',
      title: tOnboarding("step2Title"),
      description: tOnboarding("step2Desc"),
      placement: "bottom" as const,
    },
    {
      target: '[data-tour-step="3"]',
      title: tOnboarding("step3Title"),
      description: tOnboarding("step3Desc"),
      placement: "top" as const,
    },
    {
      target: '[data-tour-step="4"]',
      title: tOnboarding("step4Title"),
      description: tOnboarding("step4Desc"),
      placement: "bottom" as const,
    },
    {
      target: '[data-tour-step="5"]',
      title: tOnboarding("step5Title"),
      description: tOnboarding("step5Desc"),
      placement: "left" as const,
    },
  ];

  const showTour = !isOnboardingLoading && !onboardingCompleted;

  if (error && !stats) {
    return <DashboardError />;
  }

  return (
    <div className="w-full pb-10" aria-busy={isFetching && !statsPending}>
      {statsPending || !viewModel ? (
        <DashboardV6View
          view={{
            firstName,
            inReviewCount: 0,
            readyToApproveCount: 0,
            kpis: [],
            hero: null,
            activity: [],
            recipes: [],
            briefingRows: [],
            activeBriefingCampaignId: null,
          }}
          labels={labels}
          summary={<span className="inline-block h-4 w-80 animate-pulse rounded bg-[var(--surface-raised)]" />}
          isLoading
        />
      ) : (
        <DashboardV6View view={viewModel} labels={labels} summary={summary} />
      )}

      {showTour ? (
        <OnboardingTour steps={tourSteps} onComplete={completeOnboarding} onSkip={completeOnboarding} />
      ) : null}
    </div>
  );
}

function DashboardError() {
  const t = useTranslations("dashboard.home");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <h1 className="sr-only">{t("title")}</h1>
      <div className="mb-6 flex size-24 items-center justify-center rounded-2xl border-2 border-[var(--accent-rose)]/30 bg-[var(--surface-raised)]">
        <span className="text-4xl font-bold text-[var(--accent-rose)]">!</span>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">{t("errorTitle")}</h2>
      <p className="mb-6 text-sm text-[var(--text-muted)]">{t("errorDescription")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-[var(--accent-green)] px-6 py-3 text-sm font-bold text-[var(--ink)] transition-all hover:bg-[var(--accent-green-light)] hover:shadow-[0_0_30px_var(--accent-green-dim)]"
      >
        {t("retry")}
      </button>
    </div>
  );
}
