"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import { useCampaigns } from "@/lib/hooks/use-campaigns";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import dynamic from "next/dynamic";
import {
  CreditAlertBanner,
  WelcomeBanner,
  StatsCardsGrid,
  QuickActionsGrid,
  RecentCampaignsSection,
  CreditUsagePanel,
  ActivityFeedPanel,
  OnboardingTour,
} from "@/components/dashboard";
import { useTranslations } from "next-intl";

const RestylingModal = dynamic(() => import("@/components/workspace/RestylingModal"), {
  ssr: false,
  loading: () => null,
});

export default function DashboardPage() {
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const tNav = useTranslations("navigation");

  const { data: dashboardData, isLoading: isDashboardLoading, isError: isDashboardError } = useDashboard();
  const { campaigns, isLoading: isCampaignsLoading } = useCampaigns();

  useEffect(() => {
    setCurrentPageTitle(tNav("dashboard"));
  }, [setCurrentPageTitle, tNav]);

  const recentCampaigns = campaigns.slice(0, 5);
  const activityFeed = dashboardData?.recentActivity ?? [];

  // Stats (with fallbacks for data not yet in scope)
  const totalCampaigns = dashboardData?.campaignCount ?? recentCampaigns.length ?? 0;
  const derivationsThisMonth = 0;
  const creditsUsed = 0;
  const creditsTotal = 1000;
  const activePlatforms = new Set(recentCampaigns.flatMap((c) => c.platforms)).size;
  const campaignsChange = 0;
  const derivationsChange = 0;
  const creditsRemaining = 100;
  const creditPercent = 0;

  const [showRestylingModal, setShowRestylingModal] = useState(false);
  const { completed: onboardingCompleted, isLoading: isOnboardingLoading, complete: completeOnboarding } = useOnboarding();
  const tOnboarding = useTranslations("onboarding");

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
  ];

  const showTour = !isOnboardingLoading && !onboardingCompleted;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <CreditAlertBanner />
      <div data-tour-step="1">
        <WelcomeBanner />
      </div>
      <StatsCardsGrid
        totalCampaigns={totalCampaigns}
        derivationsThisMonth={derivationsThisMonth}
        creditsUsed={creditsUsed}
        creditsRemaining={creditsRemaining}
        activePlatforms={activePlatforms}
        campaignsChange={campaignsChange}
        derivationsChange={derivationsChange}
      />
      <div data-tour-step="2">
        <QuickActionsGrid onRestylingClick={() => setShowRestylingModal(true)} />
      </div>
      <div data-tour-step="3">
        <RecentCampaignsSection
        campaigns={recentCampaigns}
        isLoading={isCampaignsLoading}
      />
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CreditUsagePanel
          creditsUsed={creditsUsed}
          creditsTotal={creditsTotal}
          creditPercent={creditPercent}
        />
        <ActivityFeedPanel
          activityFeed={activityFeed}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
        />
      </section>
      </div>
      <RestylingModal open={showRestylingModal} onOpenChange={setShowRestylingModal} />
      {showTour && (
        <OnboardingTour
          steps={tourSteps}
          onComplete={completeOnboarding}
          onSkip={completeOnboarding}
        />
      )}
    </div>
  );
}
