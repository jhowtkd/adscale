"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function CampaignErrorState() {
  const tc = useTranslations("common");

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        {tc("errorLoadingCampaign")}
      </h2>
      <Link
        href="/campaigns"
        className="text-sm text-[var(--accent-mint)] hover:underline"
      >
        {tc("backToCampaigns")}
      </Link>
    </div>
  );
}
