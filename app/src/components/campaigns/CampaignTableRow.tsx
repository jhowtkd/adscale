"use client";

import React, { useRef } from "react";

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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { usePrefetchCampaign } from "@/lib/hooks/use-prefetch";

interface CampaignTableRowProps {
  campaign: Campaign;
  index: number;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (campaign: Campaign) => void;
}


function CampaignTableRow({
  campaign,
  index,
  selected,
  onSelect,
  onDuplicate,
  onArchive,
  onDelete,
  onSaveAsTemplate,
}: CampaignTableRowProps) {
  const tCommon = useTranslations("common");
  const router = useRouter();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const { prefetch } = usePrefetchCampaign();

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

  const handleRowClick = () => {
    router.push(`/campaigns/${campaign.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick();
    }
  };

  return (
    <tr
      ref={rowRef}
      role="link"
      tabIndex={0}
      aria-label={`${campaign.name}, status ${campaign.status}`}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => prefetch(campaign.id)}
      className={cn("animate-fade-in",
        "group border-b border-[var(--border-dim)] transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-mint)] focus-visible:ring-inset",
        "md:table-row flex flex-col rounded-xl md:rounded-none mb-3 md:mb-0 bg-[var(--surface-base)] md:bg-transparent shadow-sm md:shadow-none p-4 md:p-0",
        index % 2 === 1 && "md:bg-[rgba(0,0,0,0.02)]",
        selected && "bg-[var(--accent-mint-dim)] border-l-2 border-l-[var(--accent-mint)] md:border-l-0 md:border-l-transparent",
        !selected && "hover:bg-[var(--surface-raised)]"
      )}
    >
      {/* Checkbox — desktop only (mobile selection via bulk is handled differently) */}
      <td
        className="hidden md:table-cell px-4 py-3 w-[44px]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className={cn(
            "h-[18px] w-[18px] rounded-sm border border-[var(--border-medium)] appearance-none cursor-pointer",
            "checked:bg-[var(--accent-mint)] checked:border-[var(--accent-mint)]",
            "checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%2001%200%201.414l-5%205a1%201%20%200%2001-1.414%200l-2-2a1%201%20%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%20%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')]",
            "indeterminate:bg-[var(--accent-mint)] indeterminate:border-[var(--accent-mint)]",
            "indeterminate:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M3%208h10v1H3z%22%2F%3E%3C%2Fsvg%3E')]",
            "transition-colors duration-150"
          )}
          style={
            selected
              ? {
                  backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%2001%200%201.414l-5%205a1%201%20%200%2001-1.414%200l-2-2a1%201%20%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%20%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }
              : {}
          }
        />
      </td>

      {/* Campaign Name — mobile card header */}
      <td className="md:table-cell px-0 md:px-4 py-0 md:py-3 min-w-[200px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-mint)] transition-colors duration-150 truncate">
              {campaign.name}
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] truncate mt-0.5 md:hidden">
              {campaign.platforms.join(", ")}
            </p>
          </div>
          {/* Mobile: actions dropdown */}
          <div className="md:hidden shrink-0" onClick={(e) => e.stopPropagation()}>
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
                  onClick={() => { router.push(`/campaigns/${campaign.id}`); }}
                  className="flex items-center gap-2"
                >
                  <ExternalLink size={14} />
                  {tCommon("open")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { router.push(`/campaigns/${campaign.id}`); }}
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
      </td>

      {/* Platforms — desktop only */}
      <td className="hidden md:table-cell px-4 py-3 w-[140px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {campaign.platforms.map((platform) => {
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
      </td>

      {/* Status */}
      <td className="md:table-cell px-0 md:px-4 py-2 md:py-3 w-[120px]">
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status} />
          {/* Mobile: inline platform tags */}
          <div className="flex items-center gap-1.5 flex-wrap md:hidden">
            {campaign.platforms.map((platform) => {
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
      </td>

      {/* Variations */}
      <td className="md:table-cell px-0 md:px-4 py-1 md:py-3 w-[100px]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] md:hidden">{tCommon("variations")}:</span>
          <span className="text-sm text-[var(--text-primary)]">
            {campaign.variations > 0 ? campaign.variations : "—"}
          </span>
          {campaign.variations > 0 && (
            <div className="w-10 h-[3px] rounded-full bg-[var(--border-dim)] overflow-hidden hidden md:block">
              <div
                className="h-full rounded-full gradient-progress"
                style={{
                  width: `${Math.min(100, (campaign.variations / 48) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      </td>

      {/* Credits */}
      <td className="hidden md:table-cell px-4 py-3 w-[100px]">
        <span className="text-[13px] text-[var(--text-secondary)]">
          {campaign.creditsUsed > 0 ? `~${campaign.creditsUsed}` : "—"}
        </span>
      </td>

      {/* Last Modified */}
      <td className="md:table-cell px-0 md:px-4 py-1 md:py-3 w-[140px]">
        <span className="text-[13px] text-[var(--text-muted)]">
          <span className="md:hidden text-xs text-[var(--text-muted)] mr-1">{tCommon("modified")}:</span>
          {formattedDate}
        </span>
      </td>

      {/* Actions — desktop only */}
      <td className="hidden md:table-cell px-4 py-3 w-[56px]">
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-md",
                "text-[var(--text-muted)] opacity-0 group-hover:opacity-100",
                "hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
                "transition-all duration-200",
                "focus:opacity-100 data-[popup-open]:opacity-100"
              )}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-44">
              <DropdownMenuItem
                onClick={() => { router.push(`/campaigns/${campaign.id}`); }}
                className="flex items-center gap-2"
              >
                <ExternalLink size={14} />
                {tCommon("open")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { router.push(`/campaigns/${campaign.id}`); }}
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
      </td>
    </tr>
  );
}

export default React.memo(CampaignTableRow);
