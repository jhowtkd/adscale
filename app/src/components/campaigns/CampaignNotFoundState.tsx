"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function CampaignNotFoundState() {
  const tc = useTranslations("common");

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        {tc("campaignNotFound")}
      </h2>
      <Link
        href="/campaigns"
        className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {tc("backToCampaigns")}
      </Link>
    </div>
  );
}
