"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslations } from "next-intl";

interface CampaignsHeaderProps {
  count: number;
  isLoading?: boolean;
  onNewCampaign: () => void;
}

export default function CampaignsHeader({ count, isLoading = false, onNewCampaign }: CampaignsHeaderProps) {
  const t = useTranslations("campaign");
  const tc = useTranslations("common");

  return (
    <PageHeader
      className="animate-fade-in"
      title={tc("campaign")}
      description={t("manageCampaigns")}
      meta={
        <span
          className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--surface-raised)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <span className="inline-block h-3 w-4 animate-pulse rounded bg-[var(--border-dim)]" aria-hidden="true" />
          ) : (
            count
          )}
        </span>
      }
      actions={
        <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
          <Button
            onClick={onNewCampaign}
            className="h-9 bg-[var(--accent-green)] px-4 text-sm font-semibold text-[var(--ink)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--accent-green-light)] active:scale-[0.98]"
          >
            <Plus size={14} />
            {t("new")}
          </Button>
        </div>
      }
    />
  );
}
