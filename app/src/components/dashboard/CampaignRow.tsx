"use client";

import { platformColors } from "@/lib/mock-data";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import StatusBadge from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal } from "lucide-react";

const fallbackPlatformColors = { bg: "var(--surface-raised)", text: "var(--text-secondary)" };

interface CampaignRowProps {
  campaign: UiCampaign;
}

export function CampaignRow({ campaign }: CampaignRowProps) {
  return (
    <div
      className={cn(
        "group grid grid-cols-1 sm:grid-cols-[1fr_100px_80px_100px_80px_48px] gap-2 sm:gap-4 px-4 sm:px-6 py-3 items-center",
        "transition-colors duration-150 hover:bg-[var(--surface-raised)] cursor-pointer"
      )}
    >
      {/* Campaign name + platforms */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {campaign.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {campaign.platforms?.map((platform) => {
              const colors = platformColors[platform as keyof typeof platformColors] ?? fallbackPlatformColors;
              return (
                <span
                  key={platform}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                  }}
                >
                  {platform}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="flex justify-center">
        <StatusBadge status={campaign.status} />
      </div>

      {/* Variations */}
      <div className="text-center text-sm text-[var(--text-secondary)]">
        {campaign.variations > 0 ? campaign.variations : "—"}
      </div>

      {/* Last modified */}
      <div className="text-center text-[13px] text-[var(--text-muted)]">
        {(() => {
          const d = formatDistanceToNow(campaign.lastModified, { addSuffix: false });
          return d
            .replace("about ", "")
            .replace("less than a minute ago", "just now")
            .replace(/ minutes? ago/, "m ago")
            .replace(/ hours? ago/, "h ago")
            .replace(/ days? ago/, "d ago")
            .replace(/ weeks? ago/, "w ago")
            .replace(/ months? ago/, "mo ago");
        })()}
      </div>

      {/* Credits */}
      <div className="text-right text-sm text-[var(--text-secondary)]">
        {campaign.creditsUsed > 0 ? `${campaign.creditsUsed}` : "—"}
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <button
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-md",
            "text-[var(--text-muted)] opacity-0 group-hover:opacity-100",
            "hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
            "transition-all duration-200"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}
