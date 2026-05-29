"use client";

import React from "react";
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
  onSelect: (checked: boolean) => void;
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

  const handleCardClick = () => {
    router.push(`/campaigns/${campaign.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${campaign.name}, status ${campaign.status}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={cn("animate-fade-in",
        "group relative rounded-xl border bg-[var(--surface-base)] p-4 transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]",
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
          : "border-[var(--border-dim)] hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Header: Checkbox + Name + Actions */}
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div
          className="shrink-0 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="sr-only" htmlFor={`select-${campaign.id}`}>Select {campaign.name}</label>
          <input
            id={`select-${campaign.id}`}
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className={cn(
              "h-[18px] w-[18px] rounded-sm border border-[var(--border-medium)] appearance-none cursor-pointer",
              "checked:bg-[var(--accent-green)] checked:border-[var(--accent-green)]",
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
          <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-green)] transition-colors duration-150 truncate">
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
                    backgroundColor: colors?.bg || "rgba(99,102,241,0.12)",
                    color: colors?.text || "#818cf8",
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
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-md",
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
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Zap size={12} />
            {campaign.creditsUsed > 0 ? `~${campaign.creditsUsed}` : "—"}
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
