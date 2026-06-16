"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type DashboardCampaignItem,
  statusConfig,
} from "@/components/dashboard/campaign-status-config";

interface DashboardCampaignListViewProps {
  campaigns: DashboardCampaignItem[];
}

function ListThumbnail({
  name,
  thumbnailUrl,
}: {
  name: string;
  thumbnailUrl: string | null;
}) {
  const [imageError, setImageError] = useState(false);
  const initials = useMemo(
    () =>
      name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [name],
  );

  if (thumbnailUrl && !imageError) {
    return (
      <Image
        src={thumbnailUrl}
        alt=""
        width={64}
        height={64}
        className="size-full object-cover"
        loading="eager"
        decoding="async"
        onError={() => setImageError(true)}
        unoptimized
      />
    );
  }

  return (
    <span className="font-mono text-sm font-bold text-[var(--accent-green)]">
      {initials}
    </span>
  );
}

export default function DashboardCampaignListView({
  campaigns,
}: DashboardCampaignListViewProps) {
  const t = useTranslations("campaign");
  const locale = useLocale();
  const dateLocale = locale.startsWith("pt") ? ptBR : enUS;

  return (
    <ul className="flex flex-col gap-2" role="list">
      {campaigns.map((campaign, index) => {
        const statusInfo = statusConfig[campaign.status] ?? statusConfig.draft;
        const formattedDate = formatDistanceToNow(new Date(campaign.updatedAt), {
          addSuffix: true,
          locale: dateLocale,
        });

        return (
          <li key={campaign.id} className="animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
            <Link
              href={`/campaigns/${campaign.id}`}
              prefetch={false}
              className={cn(
                "group flex items-center gap-4 rounded-xl border-2 border-[var(--border-dim)] bg-[var(--surface-base)] p-3",
                "transition-colors duration-200 hover:border-[var(--accent-green)]/40 hover:bg-[var(--surface-raised)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--deep-bg)]",
              )}
              aria-label={`${t("openCampaign")}: ${campaign.name}`}
            >
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] flex items-center justify-center">
                <ListThumbnail name={campaign.name} thumbnailUrl={campaign.thumbnailUrl} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-green)] transition-colors">
                  {campaign.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Layers size={12} className="text-[var(--accent-green)]/60" aria-hidden="true" />
                    <span className="text-[var(--accent-green)]">{campaign.pieceCount}</span>
                    <span>
                      {campaign.pieceCount === 1
                        ? t("variationSingular")
                        : t("variationPlural")}
                    </span>
                  </span>
                  {campaign.approvedCount > 0 && (
                    <span className="text-[var(--text-muted)]">
                      · {t("approvedCount", { count: campaign.approvedCount })}
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden sm:flex shrink-0 items-center gap-3">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                    statusInfo.bg,
                    statusInfo.text,
                    statusInfo.border,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", statusInfo.dot)} />
                  {statusInfo.label}
                </div>
                <time
                  className="w-24 text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide"
                  dateTime={campaign.updatedAt}
                >
                  {formattedDate}
                </time>
              </div>

              <div className="flex sm:hidden shrink-0 flex-col items-end gap-1">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold uppercase",
                    statusInfo.bg,
                    statusInfo.text,
                    statusInfo.border,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", statusInfo.dot)} />
                  {statusInfo.label}
                </div>
                <time className="text-xs text-[var(--text-muted)]" dateTime={campaign.updatedAt}>
                  {formattedDate}
                </time>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
