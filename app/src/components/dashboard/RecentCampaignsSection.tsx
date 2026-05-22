"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { ImageOff } from "lucide-react";
import { CampaignRow } from "./CampaignRow";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { useTranslations } from "next-intl";

interface RecentCampaignsSectionProps {
  campaigns: UiCampaign[];
  isLoading: boolean;
}

export function RecentCampaignsSection({ campaigns, isLoading }: RecentCampaignsSectionProps) {
  const t = useTranslations("common");
  const tc = useTranslations("campaign");

  return (
    <section
      className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden animate-fade-in"
      style={{ animationDelay: "300ms" }}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-dim)]">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          {t("recentCampaigns")}
        </h2>
        <Link
          href="/campaigns"
          className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
        >
          {t("viewAll")}
        </Link>
      </div>

      {isLoading ? (
        <div className="px-6 py-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-[var(--surface-raised)] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-[var(--surface-raised)] rounded animate-pulse" />
                <div className="h-3 w-24 bg-[var(--surface-raised)] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length > 0 ? (
        <div className="divide-y divide-[var(--border-dim)]">
          {/* Table Header */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_100px_80px_100px_80px_48px] gap-4 px-6 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            <span>{t("campaign")}</span>
            <span className="text-center">{t("status")}</span>
            <span className="text-center">{t("variations")}</span>
            <span className="text-center">{t("modified")}</span>
            <span className="text-right">{t("credits")}</span>
            <span />
          </div>

          {campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ImageOff}
          title={t("noCampaignsYet")}
          description={t("createFirstCampaign")}
          action={{ label: tc("new"), href: "/campaigns/new" }}
          steps={[
            t("emptyState.uploadCreative"),
            t("emptyState.fillBrief"),
            t("emptyState.approveVariations"),
          ]}
        />
      )}
    </section>
  );
}
