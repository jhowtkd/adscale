"use client";

import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import dynamic from "next/dynamic";
import { Search, Plus, LayoutGrid, List } from "lucide-react";
import CampaignMasonryGrid, {
  CampaignMasonryGridItem,
  campaignMasonryGridClassName,
  campaignMasonryItemClassName,
} from "@/components/dashboard/CampaignMasonryGrid";
import VisualCampaignCard from "@/components/dashboard/VisualCampaignCard";
import DashboardCampaignListView from "@/components/dashboard/DashboardCampaignListView";
import CreditPanel from "@/components/dashboard/CreditPanel";
import LaboratoryProgressPanel from "@/components/dashboard/LaboratoryProgressPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/layout/Panel";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/ui/EmptyState";

const CreditChart = dynamic(() => import("@/components/dashboard/CreditChart"), {
  loading: () => <div className="h-[300px] w-full bg-[var(--surface-raised)] rounded-xl animate-pulse border-2 border-[var(--border-dim)]" />,
});

const ActivityFeed = dynamic(() => import("@/components/dashboard/ActivityFeed"), {
  loading: () => <div className="h-[200px] w-full bg-[var(--surface-raised)] rounded-xl animate-pulse border-2 border-[var(--border-dim)]" />,
});

const OnboardingTour = dynamic(
  () => import("@/components/dashboard/OnboardingTour").then((mod) => mod.OnboardingTour),
  {
    loading: () => null,
    ssr: false,
  }
);

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tOnboarding = useTranslations("onboarding");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const { data: stats, isLoading, isFetching, error } = useDashboardStats(period);
  const statsPending = isLoading && !stats;

  const { completed: onboardingCompleted, isLoading: isOnboardingLoading, complete: completeOnboarding } = useOnboarding();

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

  const filteredCampaigns = stats?.recentCampaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  if (error && !stats) {
    return <DashboardError />;
  }

  return (
    <div className="w-full space-y-6 pb-10">
      <PageFrame width="wide" className="pt-6">
        <div data-tour-step="1">
        <PageHeader
          title={t("home.title")}
          description={
            statsPending ? (
              <span className="inline-block h-4 w-56 animate-pulse rounded bg-[var(--surface-raised)]" />
            ) : (
              <>
                {t("home.summary", {
                  totalCampaigns: stats!.totalCampaigns,
                  derivationsThisMonth: stats!.derivationsThisMonth,
                })}
                {isFetching && !statsPending ? (
                  <span className="sr-only">{t("home.updatingStats")}</span>
                ) : null}
              </>
            )
          }
          actions={
            <div className="flex w-full flex-row items-center gap-3 lg:w-auto lg:shrink-0">
              <div className="relative min-w-0 flex-1 sm:max-w-[220px] lg:w-[220px] lg:flex-none">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label={t("home.searchAriaLabel")}
                  placeholder={t("home.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 rounded-xl border-[var(--border-dim)] bg-[var(--surface-base)] pl-9 pr-4 text-sm font-medium focus-visible:border-[var(--accent-green)]/50 focus-visible:ring-[var(--accent-green)]/20"
                />
              </div>

              <fieldset
                className="flex shrink-0 items-center rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-1"
                aria-label={t("home.viewModeLabel")}
              >
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-all ${
                    viewMode === "grid"
                      ? "bg-[var(--surface-raised)] text-[var(--accent-green-text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                  aria-label={t("home.viewGrid")}
                  aria-pressed={viewMode === "grid"}
                >
                  <LayoutGrid size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-all ${
                    viewMode === "list"
                      ? "bg-[var(--surface-raised)] text-[var(--accent-green-text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                  aria-label={t("home.viewList")}
                  aria-pressed={viewMode === "list"}
                >
                  <List size={18} aria-hidden="true" />
                </button>
              </fieldset>
            </div>
          }
        />
        </div>
      </PageFrame>

      <PageFrame width="wide">
        <LaboratoryProgressPanel />
      </PageFrame>

      <PageFrame width="wide">
        <Panel padding="md" data-tour-step="2">
          {statsPending ? (
            <CampaignGridSkeleton />
          ) : filteredCampaigns.length > 0 ? (
            viewMode === "list" ? (
              <DashboardCampaignListView
                campaigns={filteredCampaigns.map((campaign) => ({
                  id: campaign.id,
                  name: campaign.name,
                  thumbnailUrl: campaign.thumbnailUrl,
                  pieceCount: campaign.pieceCount,
                  approvedCount: campaign.approvedCount,
                  status: campaign.status,
                  updatedAt: campaign.updatedAt.toString(),
                }))}
              />
            ) : (
              <CampaignMasonryGrid>
                {filteredCampaigns.map((campaign, index) => (
                  <CampaignMasonryGridItem key={campaign.id}>
                    <VisualCampaignCard
                      id={campaign.id}
                      name={campaign.name}
                      thumbnailUrl={campaign.thumbnailUrl}
                      pieceCount={campaign.pieceCount}
                      approvedCount={campaign.approvedCount}
                      status={campaign.status}
                      updatedAt={campaign.updatedAt.toString()}
                      index={index}
                    />
                  </CampaignMasonryGridItem>
                ))}
              </CampaignMasonryGrid>
            )
          ) : (
            <CampaignsEmptyState searchQuery={searchQuery} />
          )}
        </Panel>
      </PageFrame>

      <PageFrame width="wide" aria-busy={statsPending}>
        {statsPending ? (
          <StatsSectionSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <CreditChart data={stats!.creditUsageSeries} />
            <div className="space-y-8">
              <div data-tour-step="5">
                <CreditPanel
                  remaining={stats!.creditsRemaining}
                  total={stats!.creditsTotal}
                  planKey={stats!.subscription.planKey}
                />
              </div>
              <ActivityFeed
                activities={stats!.recentActivity.map((a) => ({
                  ...a,
                  createdAt: a.createdAt.toString(),
                }))}
              />
            </div>
          </div>
        )}
      </PageFrame>

      {showTour ? (
        <OnboardingTour
          steps={tourSteps}
          onComplete={completeOnboarding}
          onSkip={completeOnboarding}
        />
      ) : null}
    </div>
  );
}

function CampaignsEmptyState({ searchQuery }: { searchQuery: string }) {
  const t = useTranslations("dashboard.home");

  return (
    <EmptyState
      image="/images/empty-state.svg"
      title={searchQuery ? t("emptyNoResults") : t("emptyNoCampaigns")}
      description={searchQuery ? t("emptyAdjustSearch") : t("emptyCreateHint")}
      action={
        searchQuery
          ? undefined
          : {
              label: t("createCampaign"),
              href: "/campaigns?new=1",
              icon: Plus,
            }
      }
    />
  );
}

const SKELETON_CARD_HEIGHTS = [280, 360, 320, 400, 300, 380];

function CampaignGridSkeleton() {
  return (
    <div className={campaignMasonryGridClassName}>
      {SKELETON_CARD_HEIGHTS.map((height, i) => (
        <div key={i} className={campaignMasonryItemClassName}>
          <div
            className="animate-pulse rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)]"
            style={{ height }}
          />
        </div>
      ))}
    </div>
  );
}

function StatsSectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="h-[300px] w-full animate-pulse rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)]" />
      <div className="space-y-8">
        <div className="h-40 w-full animate-pulse rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)]" />
        <div className="h-[200px] w-full animate-pulse rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)]" />
      </div>
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
      <button type="button"
        onClick={() => window.location.reload()}
        className="px-6 py-3 text-sm font-bold text-[var(--ink)] bg-[var(--accent-green)] rounded-xl hover:bg-[var(--accent-green-light)] transition-all hover:shadow-[0_0_30px_var(--accent-green-dim)]"
      >
        {t("retry")}
      </button>
    </div>
  );
}
