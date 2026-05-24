"use client";

import Link from "next/link";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import StatusBadge from "@/components/ui/StatusBadge";
import type { CampaignStatus } from "@/lib/mock-data";
import { useTranslations } from "next-intl";

interface CampaignWorkspaceHeaderProps {
  campaignName: string;
  status?: CampaignStatus;
  isNew: boolean;
  isDraft: boolean;
  onSaveDraft: () => void;
  onDelete: () => void;
}

export default function CampaignWorkspaceHeader({
  campaignName,
  status,
  isNew,
  isDraft,
  onSaveDraft,
  onDelete,
}: CampaignWorkspaceHeaderProps) {
  const t = useTranslations("campaign");
  const tc = useTranslations("common");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {/* Back button */}
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ChevronLeft size={16} />
          {tc("backToCampaigns")}
        </Link>

        {/* Campaign title + status */}
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 truncate text-lg font-semibold text-[var(--text-primary)]">
            {campaignName || t("new")}
          </h1>
          {status && <StatusBadge status={status} />}
        </div>
      </div>

      {/* Actions */}
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        <button
          onClick={onSaveDraft}
          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
        >
          <Save size={14} />
          {tc("saveDraft")}
        </button>
        {isDraft && !isNew && (
          <button
            onClick={onDelete}
            className="min-h-10 shrink-0 rounded-md p-2 text-[var(--accent-rose)] hover:bg-[rgba(244,63,94,0.08)] transition-colors"
            title={tc("deleteDraft")}
            aria-label={tc("deleteDraft")}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
