"use client";

import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { Campaign } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { Layers, Zap, ImageIcon } from "lucide-react";

interface CampaignCardProps {
  campaign: Campaign;
  index: number;
}

function CampaignCard({ campaign, index }: CampaignCardProps) {
  const tCampaign = useTranslations("campaign");

  const formattedDate = (() => {
    const d = formatDistanceToNow(campaign.lastModified, { addSuffix: false });
    return d
      .replace("about ", "")
      .replace("less than a minute ago", "just now")
      .replace(/ minutes? ago/, "m ago")
      .replace(/ hours? ago/, "h ago")
      .replace(/ days? ago/, "d ago")
      .replace(/ weeks? ago/, "w ago")
      .replace(/ months? ago/, "mo ago");
  })();

  return (
    <div
      className={cn("animate-fade-in",
        "group rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden",
        "transition-colors duration-300 ease-out",
        "hover:border-[var(--accent-green)]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
        "cursor-pointer"
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <Link href={`/campaigns/${campaign.id}`} className="block">
        {/* Top Section - Preview */}
        <div className="relative h-[140px] bg-[var(--surface-raised)] overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            {campaign.variations > 0 ? (
              <div className="grid grid-cols-2 gap-1 p-3 size-full">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="rounded-md bg-[var(--border-dim)] flex items-center justify-center overflow-hidden"
                  >
                    <ImageIcon
                      size={16}
                      className="text-[var(--text-muted)] opacity-40"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <div
                  className="flex items-center justify-center size-12 rounded-lg"
                  style={{
                    background: "var(--accent-green-dim)",
                  }}
                >
                  <ImageIcon size={24} className="text-[var(--accent-green)]" />
                </div>
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  {campaign.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <span className="text-sm font-semibold text-[var(--ink)] bg-[var(--accent-green)] px-4 py-2 rounded-md translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              {tCampaign("brief")}
            </span>
          </div>
        </div>

        {/* Bottom Section - Info */}
        <div className="p-4">
          {/* Campaign name */}
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] truncate leading-tight group-hover:text-[var(--accent-green)] transition-colors duration-300">
            {campaign.name}
          </h3>

          {/* Platform tags + Status */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {campaign.platforms?.map((platform) => {
              const colors = platformColors[platform as keyof typeof platformColors];
              return (
                <span
                  key={platform}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider"
                  style={{
                    backgroundColor: colors?.bg || "var(--accent-green-dim)",
                    color: colors?.text || "var(--accent-green)",
                  }}
                >
                  {platform}
                </span>
              );
            })}
            <div className="ml-auto">
              <StatusBadge status={campaign.status} showDot={false} className="text-xs px-2 py-0.5" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-dim)]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] font-mono">
                <Layers size={12} />
                {campaign.variations > 0 ? campaign.variations : "—"}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] font-mono">
                <Zap size={12} />
                {campaign.creditsUsed > 0 ? `~${campaign.creditsUsed}` : "—"}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {formattedDate}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default React.memo(CampaignCard);
