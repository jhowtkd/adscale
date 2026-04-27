"use client";

import { motion } from "framer-motion";
import Link from "next/link";
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

interface CampaignTableRowProps {
  campaign: Campaign;
  index: number;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] },
  },
};

export default function CampaignTableRow({
  campaign,
  index,
  selected,
  onSelect,
  onDuplicate,
  onArchive,
  onDelete,
}: CampaignTableRowProps) {
  const tCommon = useTranslations("common");

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
    <motion.tr
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.05 }}
      className={cn(
        "group border-b border-[var(--border-dim)] transition-colors duration-150 cursor-pointer",
        index % 2 === 1 && "bg-[rgba(255,255,255,0.01)]",
        selected && "bg-[rgba(99,102,241,0.06)] border-l-2 border-l-[var(--accent-blue)]",
        !selected && "hover:bg-[var(--surface-raised)]"
      )}
      style={{ height: 64 }}
    >
      {/* Checkbox */}
      <td className="px-4 py-3 w-[44px]">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "h-[18px] w-[18px] rounded-sm border border-[var(--border-medium)] appearance-none cursor-pointer",
            "checked:bg-[var(--accent-blue)] checked:border-[var(--accent-blue)] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%2001%200%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')]",
            "indeterminate:bg-[var(--accent-blue)] indeterminate:border-[var(--accent-blue)] indeterminate:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M3%208h10v1H3z%22%2F%3E%3C%2Fsvg%3E')]",
            "transition-colors duration-150"
          )}
        />
      </td>

      {/* Campaign Name */}
      <td className="px-4 py-3 min-w-[200px]">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="block"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors duration-150 truncate">
            {campaign.name}
          </p>
          <p className="text-[13px] text-[var(--text-secondary)] truncate mt-0.5">
            {campaign.platforms.join(", ")}
          </p>
        </Link>
      </td>

      {/* Platforms */}
      <td className="px-4 py-3 w-[140px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {campaign.platforms.map((platform) => {
            const colors = platformColors[platform as keyof typeof platformColors];
            return (
              <span
                key={platform}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
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
      <td className="px-4 py-3 w-[120px]">
        <StatusBadge status={campaign.status} />
      </td>

      {/* Variations */}
      <td className="px-4 py-3 w-[100px]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-primary)]">
            {campaign.variations > 0 ? campaign.variations : "—"}
          </span>
          {campaign.variations > 0 && (
            <div className="w-10 h-[3px] rounded-full bg-[var(--border-dim)] overflow-hidden">
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
      <td className="px-4 py-3 w-[100px] hidden md:table-cell">
        <span className="text-[13px] text-[var(--text-secondary)]">
          {campaign.creditsUsed > 0 ? `~${campaign.creditsUsed}` : "—"}
        </span>
      </td>

      {/* Last Modified */}
      <td className="px-4 py-3 w-[140px]">
        <span className="text-[13px] text-[var(--text-muted)]">
          {formattedDate}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-[56px]">
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-md",
                "text-[var(--text-muted)] opacity-0 group-hover:opacity-100",
                "hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
                "transition-all duration-200",
                "focus:opacity-100 data-[popup-open]:opacity-100"
              )}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-44">
              <DropdownMenuItem
                onClick={() => { window.location.href = `/campaigns/${campaign.id}`; }}
                className="flex items-center gap-2"
              >
                <ExternalLink size={14} />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { window.location.href = `/campaigns/${campaign.id}`; }}
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
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onArchive(campaign.id)}
                className="flex items-center gap-2"
              >
                <Archive size={14} />
                Archive
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
    </motion.tr>
  );
}
