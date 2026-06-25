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
        <Button onClick={onNewCampaign} size="sm">
          <Plus size={14} aria-hidden="true" />
          {t("new")}
        </Button>
      }
    />
  );
}
