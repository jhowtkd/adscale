"use client";

import { Check, X, Package, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface BulkActionsBarProps {
  selectedCount: number;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onExportAll: () => void;
  onClear: () => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  isExporting?: boolean;
}

export default function BulkActionsBar({
  selectedCount,
  onApproveAll,
  onRejectAll,
  onExportAll,
  onClear,
  isApproving,
  isRejecting,
  isExporting,
}: BulkActionsBarProps) {
  const t = useTranslations("derivation");
  const commonT = useTranslations("common");

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-xl bg-[var(--deep-bg)]/90 backdrop-blur-md border border-[var(--border-medium)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-300 animate-fade-in">
        <span className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">
          {t("selectedCount", { count: selectedCount })}
        </span>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onApproveAll}
            disabled={isApproving}
            className="border-[var(--accent-mint)] text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
          >
            {isApproving ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : (
              <Check size={14} className="mr-1" />
            )}
            {t("approveAll")}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={onRejectAll}
            disabled={isRejecting}
            className="border-[var(--accent-rose)] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10"
          >
            {isRejecting ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : (
              <X size={14} className="mr-1" />
            )}
            {t("rejectAll")}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={onExportAll}
            disabled={isExporting}
            className="border-[var(--accent-blue)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
          >
            {isExporting ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : (
              <Package size={14} className="mr-1" />
            )}
            {t("exportPackageBulk")}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={isApproving || isRejecting || isExporting}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {commonT("clear")}
          </Button>
        </div>
      </div>
    </div>
  );
}
