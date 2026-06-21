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

  const description = isLoading
    ? t("manageCampaignsShort")
    : count > 0
      ? t("listSubtitle", { count })
      : t("manageCampaignsShort");

  return (
    <PageHeader
      className="animate-fade-in py-5"
      title={tc("pageTitle")}
      description={description}
      actions={
        <Button
          onClick={onNewCampaign}
          className="h-9 bg-[var(--accent-green)] px-4 text-sm font-semibold text-[var(--ink)] transition-all duration-200 hover:-translate-y-px hover:bg-[var(--accent-green-light)] active:scale-[0.98]"
        >
          <Plus size={14} />
          {t("new")}
        </Button>
      }
    />
  );
}
