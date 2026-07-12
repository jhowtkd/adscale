"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import { statusConfig } from "@/components/dashboard/campaign-status-config";
import { cn } from "@/lib/utils";

function Thumb({ name, thumbnailUrl }: { name: string; thumbnailUrl: string | null }) {
  const [imageError, setImageError] = useState(false);
  const initials = useMemo(
    () =>
      name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [name]
  );

  if (thumbnailUrl && !imageError) {
    return (
      <Image
        src={thumbnailUrl}
        alt=""
        width={32}
        height={32}
        className="size-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setImageError(true)}
        unoptimized
      />
    );
  }

  return (
    <span className="font-mono text-[10px] font-bold text-[var(--accent-primary-text)]">
      {initials}
    </span>
  );
}

export default function SidebarRecentWorks() {
  const tNav = useTranslations("navigation");
  const locale = useLocale();
  const dateLocale = locale.startsWith("pt") ? ptBR : enUS;
  const { data: stats, isLoading } = useDashboardStats("month", "7");
  const campaigns = stats?.recentCampaigns ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-1" data-testid="sidebar-recent-works">
      <p className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {tNav("recentWorks")}
      </p>

      {isLoading && campaigns.length === 0 ? (
        <div className="space-y-2 px-1" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-raised)]"
            />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-center">
          <p className="text-[12px] text-[var(--text-muted)]">{tNav("recentWorksEmpty")}</p>
          <Link
            href="/campaigns?new=1"
            className="mt-2 inline-block text-[12px] font-medium text-[var(--accent-primary-text)] hover:underline"
          >
            {tNav("recentWorksCreate")}
          </Link>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" role="list">
          {campaigns.map((campaign) => {
            const statusInfo = statusConfig[campaign.status] ?? statusConfig.draft;
            const updatedAt =
              campaign.updatedAt instanceof Date
                ? campaign.updatedAt.toISOString()
                : String(campaign.updatedAt);
            const formattedDate = formatDistanceToNow(new Date(campaign.updatedAt), {
              addSuffix: true,
              locale: dateLocale,
            });

            return (
              <li key={campaign.id}>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2",
                    "transition-colors hover:bg-[var(--surface-inset)]"
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                    <Thumb name={campaign.name} thumbnailUrl={campaign.thumbnailUrl} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {campaign.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                      <span
                        className={cn("inline-block size-1.5 rounded-full", statusInfo.dot)}
                        aria-hidden="true"
                      />
                      <time dateTime={updatedAt}>{formattedDate}</time>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
