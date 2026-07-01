"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { Campaign } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Pencil,
  Copy,
  LayoutTemplate,
  Archive,
  Trash2,
  ExternalLink,
  Layers,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface CampaignListCardProps {
  campaign: Campaign;
  index: number;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (campaign: Campaign) => void;
}


function CampaignListCard({
  campaign,
  index,
  selected,
  onSelect,
  onDuplicate,
  onArchive,
  onDelete,
  onSaveAsTemplate,
}: CampaignListCardProps) {
  const tCommon = useTranslations("common");
  const tCampaigns = useTranslations("campaigns");
  const router = useRouter();

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
      aria-labelledby={`campaign-${campaign.id}-name`}
      className={cn("animate-fade-in",
        "group relative rounded-xl border bg-[var(--surface-base)] p-4 transition-all duration-150 cursor-pointer outline-none focus-within:ring-2 focus-within:ring-[var(--focus-ring)]",
        selected
          ? "border-[var(--border-strong)] bg-[var(--surface-inset)]"
          : "border-[var(--border-dim)] hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Link
        href={`/campaigns/${campaign.id}`}
        aria-label={`${campaign.name}, status ${campaign.status}`}
        className="absolute inset-0 z-0 rounded-xl"
      />
      {campaign.previewPendingBatch ? (
        <div className="relative z-10 mb-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--text-primary)]">
            <Zap className="size-3 text-[var(--accent-amber)]" />
            {tCampaigns("previewPendingBatchCta")}
          </span>
        </div>
      ) : null}

      {/* Header: Checkbox + Name + Actions */}
      <div className="relative z-10 flex items-start gap-3">
        {/* Checkbox */}
        <div
          className="flex shrink-0 items-center justify-center pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="sr-only" htmlFor={`select-${campaign.id}`}>Select {campaign.name}</label>
          <input
            id={`select-${campaign.id}`}
            type="checkbox"
            aria-label={`Select ${campaign.name}`}
            checked={selected}
            onChange={(e) => onSelect(campaign.id, e.target.checked)}
            className={cn(
              "size-[18px] rounded-sm border border-[var(--border-medium)] appearance-none cursor-pointer",
              "checked:bg-[var(--neutral-dot)] checked:border-[var(--neutral-dot)]",
              "checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%20%200%2001%200%201.414l-5%205a1%201%20%200%2001-1.414%200l-2-2a1%201%20%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%20%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')]",
              "transition-colors duration-150"
            )}
            style={
              selected
                ? {
                    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%20%200%2001%200%201.414l-5%205a1%201%20%200%2001-1.414%200l-2-2a1%201%20%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%20%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }
                : {}
            }
          />
        </div>

        {/* Name + Platforms */}
        <div className="min-w-0 flex-1">
          <p
            id={`campaign-${campaign.id}-name`}
            className="truncate text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 group-hover:text-[var(--text-secondary)]"
          >
            {campaign.name}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {campaign.platforms?.map((platform) => {
              const colors = platformColors[platform as keyof typeof platformColors];
              return (
                <span
                  key={platform}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: colors?.bg || "var(--neutral-bg)",
                    color: colors?.text || "var(--neutral-text)",
                  }}
                >
                  {platform}
                </span>
              );
            })}
          </div>
        </div>

        {/* Actions dropdown */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={tCampaigns("v6.actionsFor", { name: campaign.name })}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-md",
                "text-[var(--text-muted)]",
                "hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
                "transition-all duration-200"
              )}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-44">
              <DropdownMenuItem
                onClick={() => router.push(`/campaigns/${campaign.id}`)}
                className="flex items-center gap-2"
              >
                <ExternalLink size={14} />
                {tCommon("open")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/campaigns/${campaign.id}`)}
                className="flex items-center gap-2"
              >
                <Pencil size={14} />
                {tCommon("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDuplicate(campaign.id)}
                className="flex items-center gap-2"
              >
                <Copy size={14} />
                {tCommon("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSaveAsTemplate(campaign)}
                className="flex items-center gap-2"
              >
                <LayoutTemplate size={14} />
                {tCommon("saveAsTemplate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onArchive(campaign.id)}
                className="flex items-center gap-2"
              >
                <Archive size={14} />
                {tCommon("archive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(campaign.id)}
                className="flex items-center gap-2"
              >
                <Trash2 size={14} />
                {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Details row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-dim)]">
        <div className="flex items-center gap-4">
          <StatusBadge status={campaign.status} />
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Layers size={12} />
            {campaign.variations > 0 ? campaign.variations : "—"}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {formattedDate}
        </span>
      </div>
    </div>
  );
}

export default React.memo(CampaignListCard);
