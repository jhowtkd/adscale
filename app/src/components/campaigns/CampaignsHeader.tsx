"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface CampaignsHeaderProps {
  count: number;
  onNewCampaign: () => void;
}

export default function CampaignsHeader({ count, onNewCampaign }: CampaignsHeaderProps) {
  const t = useTranslations("campaign");
  const tc = useTranslations("common");

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border-dim)] animate-fade-in">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
            {tc("campaign")}
          </h1>
          <span className="inline-flex items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs font-medium px-2.5 py-0.5 min-w-[24px] h-6">
            {count}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("manageCampaigns")}
        </p>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
        <Button
          onClick={onNewCampaign}
          className="bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98] transition-all duration-200 h-9 px-4"
        >
          <Plus size={16} />
          {t("new")}
        </Button>
      </div>
    </div>
  );
}
