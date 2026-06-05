"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CampaignLoadErrorKind } from "@/lib/campaign-load-error";
import { Button } from "@/components/ui/button";

interface CampaignErrorStateProps {
  kind?: CampaignLoadErrorKind;
  onRetry?: () => void;
}

export default function CampaignErrorState({ kind = "unknown", onRetry }: CampaignErrorStateProps) {
  const tc = useTranslations("common");
  const te = useTranslations("campaign.errors");

  const title = te.has(`${kind}.title`) ? te(`${kind}.title`) : tc("errorLoadingCampaign");
  const description = te.has(`${kind}.description`) ? te(`${kind}.description`) : undefined;

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 px-4 text-center">
      <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
      {description ? (
        <p className="text-sm text-[var(--text-secondary)] max-w-md">{description}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            {te("retry")}
          </Button>
        ) : null}
        <Link
          href="/campaigns"
          className="text-sm text-[var(--accent-green)] hover:underline"
        >
          {tc("backToCampaigns")}
        </Link>
      </div>
    </div>
  );
}
