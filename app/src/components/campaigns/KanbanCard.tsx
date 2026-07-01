"use client";

import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";

import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { platformColors } from "@/lib/mock-data";
import StatusBadge from "@/components/ui/StatusBadge";

interface KanbanCardProps {
  campaign: UiCampaign;
  index: number;
}

function KanbanCard({ campaign, index }: KanbanCardProps) {
  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className={cn(
        "animate-fade-in block rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden",
        "transition-all duration-200",
        "hover:border-[var(--border-medium)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        "cursor-pointer"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="p-3">
        <div className="mb-2">
          <StatusBadge status={campaign.status} className="text-[10px] px-1.5 py-0.5" />
        </div>

        {/* Campaign name */}
        <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
          {campaign.name}
        </h4>

        {/* Client */}
        {campaign.client && (
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            {campaign.client}
          </p>
        )}

        {/* Platform tags + Status */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {campaign.platforms?.slice(0, 2).map((platform) => {
            const colors = platformColors[platform as keyof typeof platformColors];
            return (
              <span
                key={platform}
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: colors?.bg || "var(--neutral-bg)",
                  color: colors?.text || "var(--neutral-text)",
                }}
              >
                {platform}
              </span>
            );
          })}
          <div className="ml-auto shrink-0">
            {campaign.platforms.length > 2 ? (
              <span className="text-[10px] text-[var(--text-muted)]">
                +{campaign.platforms.length - 2}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default React.memo(KanbanCard);
