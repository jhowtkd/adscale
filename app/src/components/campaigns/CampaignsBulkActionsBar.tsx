"use client";

import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface CampaignsBulkActionsBarProps {
  selectedCount: number;
  isPending: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function CampaignsBulkActionsBar({
  selectedCount,
  isPending,
  onArchive,
  onDelete,
  onCancel,
}: CampaignsBulkActionsBarProps) {
  const tc = useTranslations("common");

  if (selectedCount === 0) return null;

  return (
    <div
      className="mb-3 flex items-center justify-between rounded-lg border border-[var(--selection-border)] bg-[var(--selection-bg)] px-4 py-3 transition-all duration-250"
    >
      <span className="text-sm font-medium text-[var(--selection-text)]">
        {selectedCount} {tc("selected")}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onArchive}
          disabled={isPending}
          className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] h-7 text-xs"
        >
          <Archive size={14} className="mr-1" />
          {tc("archive")}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isPending}
          className="h-7 text-xs"
        >
          <Trash2 size={14} className="mr-1" />
          {tc("delete")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] h-7 text-xs"
        >
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
