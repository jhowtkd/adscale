"use client";

import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import {
  KpiCard,
  QuickActions,
  CampaignList,
  CreditPanel,
} from "@/components/dashboard";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import Link from "next/link";
import dynamic from "next/dynamic";

const CreditChart = dynamic(() => import("@/components/dashboard/CreditChart"), {
  loading: () => <div className="h-[300px] w-full bg-[#1a1a24] rounded-[4px] animate-pulse" />,
});

const ActivityFeed = dynamic(() => import("@/components/dashboard/ActivityFeed"), {
  loading: () => <div className="h-[200px] w-full bg-[#1a1a24] rounded-[4px] animate-pulse" />,
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
  const tNav = useTranslations("navigation");
  const tOnboarding = useTranslations("onboarding");
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const { data: stats, isLoading, error } = useDashboardStats();

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

  useEffect(() => {
    setCurrentPageTitle(tNav("dashboard"));
  }, [setCurrentPageTitle, tNav]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return <DashboardError />;
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8" data-tour-step="1">
        <div>
          <h1 className="text-lg font-semibold text-[#e8e8ec]">Dashboard</h1>
          <p className="text-[13px] text-[#4a4a52]">
            {stats.totalCampaigns} campanhas, {stats.derivationsThisMonth} derivações este mês
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/campaigns/new"
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-[#0a0a0f] bg-[#2fb67d] rounded-[4px] hover:bg-[#259d6a] transition-colors"
            data-tour-step="4"
          >
            + Nova Campanha
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div data-tour-step="2">
        <QuickActions />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mt-6">
        <KpiCard
          label={t("kpi.campaigns")}
          value={stats.totalCampaigns}
          change={stats.campaignsChange}
          changeLabel={t("kpi.vsLastMonth")}
        />
        <KpiCard
          label={t("kpi.derivations")}
          value={stats.derivationsThisMonth}
          change={stats.derivationsChange}
          changeLabel={t("kpi.vsLastMonth")}
        />
        <KpiCard
          label={t("kpi.approval")}
          value={`${stats.approvalRate}%`}
          change={stats.approvalChange}
          changeLabel={t("kpi.vsLastMonth")}
        />
        <KpiCard
          label={t("kpi.credits")}
          value={stats.creditsRemaining}
          change={-stats.creditsUsedThisMonth}
          changeLabel={t("kpi.usedThisMonth")}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-[1fr_320px] gap-3 mt-6">
        {/* Left Column */}
        <div className="space-y-3">
          <CreditChart data={stats.creditUsageSeries} />
          <div data-tour-step="3">
            <CampaignList campaigns={stats.recentCampaigns.map((c) => ({ ...c, updatedAt: c.updatedAt.toString() }))} />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          <div data-tour-step="5">
            <CreditPanel
              remaining={stats.creditsRemaining}
              total={stats.creditsTotal}
              planKey={stats.subscription.planKey}
            />
          </div>
          <ActivityFeed activities={stats.recentActivity.map((a) => ({ ...a, createdAt: a.createdAt.toString() }))} />
        </div>
      </div>

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

function DashboardSkeleton() {
  return (
    <div className="p-8 animate-pulse">
      <div className="h-6 bg-[#1a1a24] rounded-[4px] w-32 mb-2" />
      <div className="h-4 bg-[#1a1a24] rounded-[4px] w-64 mb-8" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-[#1a1a24] rounded-[4px]" />
        ))}
      </div>
    </div>
  );
}

function DashboardError() {
  return (
    <div className="p-8 text-center">
      <p className="text-[#e8e8ec]">Erro ao carregar dashboard</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 text-sm text-[#0a0a0f] bg-[#2fb67d] rounded-[4px]"
      >
        Tentar novamente
      </button>
    </div>
  );
}
