"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCreateCampaign } from "@/lib/hooks/use-campaigns";

export function useBootstrapNewCampaign(campaignId: string) {
  const router = useRouter();
  const t = useTranslations("campaign");
  const createCampaign = useCreateCampaign();
  const startedRef = useRef(false);
  const isNew = campaignId === "new";

  useEffect(() => {
    if (!isNew || startedRef.current) return;
    startedRef.current = true;

    createCampaign.mutate(
      { name: t("new"), client: t("bootstrapDraftClient") },
      {
        onSuccess: (campaign) => {
          router.replace(`/campaigns/${campaign.id}`);
        },
      }
    );
  }, [isNew, createCampaign, router, t]);

  return {
    isBootstrapping:
      isNew && (createCampaign.isPending || (!createCampaign.isError && !createCampaign.isSuccess)),
    bootstrapError: createCampaign.isError ? createCampaign.error : null,
  };
}
