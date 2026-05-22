"use client";

import { QuickActionCard } from "./QuickActionCard";
import { Sparkles, Upload, ImageIcon, Users } from "lucide-react";
import { useTranslations } from "next-intl";

interface QuickActionsGridProps {
  onRestylingClick: () => void;
}

export function QuickActionsGrid({ onRestylingClick }: QuickActionsGridProps) {
  const t = useTranslations("common");

  return (
    <section
      className="space-y-4 animate-fade-in"
      style={{ animationDelay: "200ms" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          {t("quickActions")}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickActionCard
          icon={Sparkles}
          title={t("restyling")}
          description={t("restylingDesc")}
          iconBgColor="var(--accent-mint-dim)"
          iconColor="var(--accent-mint)"
          onClick={onRestylingClick}
          featured
          index={0}
        />
        <QuickActionCard
          icon={Upload}
          title={t("uploadCreative")}
          description={t("uploadCreativeDesc")}
          iconBgColor="var(--accent-mint-dim)"
          iconColor="var(--accent-mint)"
          href="/campaigns"
          index={1}
        />
        <QuickActionCard
          icon={ImageIcon}
          title={t("browseLibrary")}
          description={t("browseLibraryDesc")}
          iconBgColor="var(--accent-mint-dim)"
          iconColor="var(--accent-mint)"
          href="/campaigns"
          index={2}
        />
        <QuickActionCard
          icon={Users}
          title={t("inviteTeam")}
          description={t("inviteTeamDesc")}
          iconBgColor="rgba(212,160,23,0.12)"
          iconColor="var(--accent-amber)"
          disabled
          index={3}
        />
      </div>
    </section>
  );
}
