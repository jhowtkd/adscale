"use client";

import StatsCard from "@/components/ui/StatsCard";
import { FolderOpen, Layers, Zap, Globe } from "lucide-react";
import { useTranslations } from "next-intl";

interface StatsCardsGridProps {
  totalCampaigns: number;
  derivationsThisMonth: number;
  creditsUsed: number;
  creditsRemaining: number;
  activePlatforms: number;
  campaignsChange: number;
  derivationsChange: number;
}

export function StatsCardsGrid({
  totalCampaigns,
  derivationsThisMonth,
  creditsUsed,
  creditsRemaining,
  activePlatforms,
  campaignsChange,
  derivationsChange,
}: StatsCardsGridProps) {
  const tNav = useTranslations("navigation");
  const t = useTranslations("common");

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      <StatsCard
        icon={FolderOpen}
        label={tNav("campaigns")}
        value={totalCampaigns}
        change={{ value: `${campaignsChange}%`, positive: true }}
        iconBgColor="var(--accent-mint-dim)"
        iconColor="var(--accent-mint)"
        index={0}
      />
      <StatsCard
        icon={Layers}
        label={t("derivationsThisMonth")}
        value={derivationsThisMonth}
        change={{ value: `${derivationsChange}%`, positive: true }}
        iconBgColor="var(--accent-mint-dim)"
        iconColor="var(--accent-mint)"
        index={1}
      />
      <StatsCard
        icon={Zap}
        label={t("creditsUsedLabel")}
        value={creditsUsed}
        change={{
          value: `${creditsRemaining}% ${t("remaining")}`,
          positive: false,
        }}
        iconBgColor="rgba(212,160,23,0.12)"
        iconColor="var(--accent-amber)"
        index={2}
      />
      <StatsCard
        icon={Globe}
        label={t("activePlatforms")}
        value={activePlatforms}
        iconBgColor="var(--accent-mint-dim)"
        iconColor="var(--accent-mint)"
        index={3}
      />
    </section>
  );
}
