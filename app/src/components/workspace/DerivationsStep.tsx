"use client";

import { useState, useMemo, useCallback } from "react";
import { Check, Clock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import DerivationCard from "./DerivationCard";
import DerivationComparisonModal from "./DerivationComparisonModal";
import BulkActionsBar from "./BulkActionsBar";
import { useZipExport } from "@/lib/hooks/use-zip-export";
import { useShareLink } from "@/lib/hooks/use-share-link";
import type { Derivation } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface DerivationsStepProps {
  derivations: Derivation[];
  generationMode?: "art_variation" | "format_adaptation" | "restyling";
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  onRegenerate: (id: string, feedback?: string) => void;
  onGenerateMore: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onCreateDeliveryPackage?: (id: string) => void;
  onRunQa?: (id: string) => void;
  onSaveAsReference?: (id: string) => void;
  onGenerateLandingPage?: (id: string) => void;
  qaAnalyzingId?: string | null;
  savingReferenceId?: string | null;
  approvingId?: string | null;
  rejectingId?: string | null;
  regeneratingId?: string | null;
  landingPageGeneratingId?: string | null;
  isGeneratingMore?: boolean;
}

type GridSize = "small" | "medium" | "large";
type SortOption = "best" | "newest" | "oldest" | "angle" | "status";
type StatusFilter = "all" | "completed" | "generating" | "failed";

const COMPLETED_STATUSES = new Set(["completed", "approved", "rejected"]);
const ACTIVE_STATUSES = new Set(["queued", "processing", "generating"]);

// ============================================
// Component
// ============================================

export default function DerivationsStep({
  derivations,
  generationMode,
  onPreview,
  onDownload,
  onRegenerate,
  onGenerateMore,
  onApprove,
  onReject,
  onCreateDeliveryPackage,
  onRunQa,
  onSaveAsReference,
  onGenerateLandingPage,
  qaAnalyzingId,
  savingReferenceId,
  approvingId,
  rejectingId,
  regeneratingId,
  landingPageGeneratingId,
  isGeneratingMore,
}: DerivationsStepProps) {
  const t = useTranslations("derivation");
  const commonT = useTranslations("common");
  const [gridSize, setGridSize] = useState<GridSize>("medium");
  const [sortBy, setSortBy] = useState<SortOption>("best");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const isSelectionMode = selectedIds.length > 0;

  const zipExport = useZipExport();
  const shareLink = useShareLink();

  const {
    filteredDerivations,
    completedCount,
    activeCount,
    failedCount,
    totalCount,
    isAllCompleted,
    totalCredits,
    statusCounts,
  } = useMemo(() => {
    const filtered: Derivation[] = [];
    let completed = 0;
    let active = 0;
    let failed = 0;
    let credits = 0;
    const counts: Record<StatusFilter, number> = {
      all: 0,
      completed: 0,
      generating: 0,
      failed: 0,
    };

    for (const derivation of derivations) {
      credits += derivation.creditCost;
      counts.all++;

      if (COMPLETED_STATUSES.has(derivation.status)) {
        completed++;
        counts.completed++;
      }
      if (ACTIVE_STATUSES.has(derivation.status)) {
        active++;
        counts.generating++;
      }
      if (derivation.status === "failed") {
        failed++;
        counts.failed++;
      }

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "completed"
          ? COMPLETED_STATUSES.has(derivation.status)
          : derivation.status === statusFilter);

      if (matchesStatus) {
        filtered.push(derivation);
      }
    }

    switch (sortBy) {
      case "best":
        filtered.sort((a, b) => (b.qualityScore ?? -1) - (a.qualityScore ?? -1));
        break;
      case "newest":
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "oldest":
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        break;
      case "status": {
        const order: Record<string, number> = {
          completed: 0,
          approved: 0,
          rejected: 0,
          generating: 1,
          processing: 1,
          queued: 2,
          failed: 3,
          draft: 4,
          active: 5,
        };
        filtered.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
        break;
      }
      default:
        break;
    }

    return {
      filteredDerivations: filtered,
      completedCount: completed,
      activeCount: active,
      failedCount: failed,
      totalCount: derivations.length,
      isAllCompleted: derivations.length > 0 && completed === derivations.length,
      totalCredits: credits,
      statusCounts: counts,
    };
  }, [derivations, sortBy, statusFilter]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(filteredDerivations.map((d) => d.id));
  }, [filteredDerivations]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleBulkDownloadZip = useCallback(() => {
    if (selectedIds.length === 0) return;
    zipExport.mutate({ derivationIds: selectedIds }, {
      onSuccess: () => clearSelection(),
    });
  }, [selectedIds, zipExport, clearSelection]);

  const handleBulkCreateShareLink = useCallback(() => {
    if (selectedIds.length === 0) return;
    const campaignId = derivations[0]?.campaignId;
    if (!campaignId) return;
    shareLink.mutate({ campaignId, derivationIds: selectedIds }, {
      onSuccess: () => clearSelection(),
    });
  }, [selectedIds, derivations, shareLink, clearSelection]);

  // Grid classes
  const gridClasses = {
    small: "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
    medium: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
    large: "grid-cols-[repeat(auto-fill,minmax(340px,1fr))]",
  };

  return (
    <div className="space-y-5">
      {/* ---- Stats Bar ---- */}
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-in">
        {/* Left: Progress */}
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {completedCount}/{totalCount} {t("variationsGenerated")}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-[200px] h-1.5 bg-[var(--border-dim)] rounded-full overflow-hidden">
                <div
                  className="h-full gradient-progress rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          </div>

          {filteredDerivations.length > 0 && (
            <div className="flex items-center gap-2 pl-4 border-l border-[var(--border-dim)]">
              {isSelectionMode ? (
                <>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
                  >
                    {t("clearSelection")}
                  </button>
                  {selectedIds.length === 2 && (
                    <button
                      onClick={() => setIsCompareOpen(true)}
                      className="text-xs font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-light)] transition-colors"
                    >
                      {t("compare")}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={selectAll}
                  className="text-xs text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
                >
                  {t("selectAll")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Meta info + controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span>~{totalCredits.toFixed(1)} {commonT("credits")}</span>
            <span className="mx-1">·</span>
            <Clock size={12} />
            <span>
              {activeCount > 0
                ? t("inProgress", { count: activeCount })
                : failedCount > 0
                  ? t("failedCount", { count: failedCount })
                  : t("ready")}
            </span>
          </div>

          {/* Grid size toggle */}
          <div className="hidden sm:flex items-center bg-[var(--surface-raised)] rounded-md border border-[var(--border-dim)]">
            {(["small", "medium", "large"] as GridSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setGridSize(size)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 capitalize",
                  gridSize === size
                    ? "bg-[var(--accent-blue)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {size === "small" ? "S" : size === "medium" ? "M" : "L"}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-8 px-3 text-xs rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] focus:border-[var(--accent-mint)] focus:outline-none"
          >
            <option value="best">{t("bestFirst")}</option>
            <option value="newest">{commonT("newest")}</option>
            <option value="oldest">{commonT("oldest")}</option>
            <option value="angle">{t("byAngle")}</option>
            <option value="status">{t("byStatus")}</option>
          </select>
        </div>
      </div>

      {/* ---- Status Filter Pills ---- */}
      <div className="flex items-center gap-2 flex-wrap animate-fade-in" style={{ animationDelay: "100ms" }}>
        {(["all", "completed", "generating", "failed"] as StatusFilter[]).map((filter) => {
          const count =
            filter === "all" ? statusCounts.all : statusCounts[filter];
          const label = filter === "all" ? commonT("allStatus") : t(filter);
          return (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 capitalize",
                statusFilter === filter
                  ? "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {label}
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  statusFilter === filter
                    ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue-light)]"
                    : "bg-[var(--surface-base)] text-[var(--text-muted)]"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- All Completed Banner ---- */}
      {isAllCompleted && (
        <div className="flex items-center gap-2 bg-[var(--accent-mint-dim)] border border-[var(--accent-mint)]/20 rounded-lg px-4 py-3 animate-fade-in">
          <Check size={18} className="text-[var(--accent-teal)]" />
          <span className="text-sm font-medium text-[var(--accent-mint)]">
            {t("allCompleted")}
          </span>
        </div>
      )}

      {/* ---- Derivations Grid ---- */}
      {derivations.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={{
            label: t("emptyAction"),
            onClick: onGenerateMore,
          }}
        />
      ) : filteredDerivations.length > 0 ? (
        <div className={cn("grid gap-4", gridClasses[gridSize])}>
          {filteredDerivations.map((derivation, i) => {
            const isSelected = selectedIds.includes(derivation.id);
            return (
              <div key={derivation.id} className="relative group/card">
                {/* Checkbox */}
                <div
                  className={cn(
                    "absolute top-2 left-2 z-20 transition-opacity duration-200",
                    isSelectionMode ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"
                  )}
                >
                  <label
                    className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-md border shadow-sm cursor-pointer transition-all duration-150",
                      isSelected
                        ? "bg-[var(--accent-mint)] border-[var(--accent-mint)] text-white"
                        : "bg-white/90 border-[var(--border-dim)] hover:border-[var(--accent-mint)]"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(derivation.id)}
                      className="sr-only"
                    />
                    {isSelected && <Check size={14} />}
                  </label>
                </div>

                <DerivationCard
                  derivation={derivation}
                  index={i}
                  onPreview={onPreview}
                  onDownload={onDownload}
                  onRegenerate={onRegenerate}
                  onApprove={() => onApprove?.(derivation.id)}
                  onReject={() => onReject?.(derivation.id)}
                  onCreateDeliveryPackage={() => onCreateDeliveryPackage?.(derivation.id)}
                  onRunQa={() => onRunQa?.(derivation.id)}
                  onSaveAsReference={onSaveAsReference ? () => onSaveAsReference(derivation.id) : undefined}
                  onGenerateLandingPage={onGenerateLandingPage ? () => onGenerateLandingPage(derivation.id) : undefined}
                  qaAnalyzingId={qaAnalyzingId}
                  isSavingReference={savingReferenceId === derivation.id}
                  isApproving={approvingId === derivation.id}
                  isRejecting={rejectingId === derivation.id}
                  regeneratingId={regeneratingId}
                  landingPageGeneratingId={landingPageGeneratingId}
                  gridSize={gridSize}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)] animate-fade-in">
          <p className="text-sm text-[var(--text-muted)] mb-4">
            {t("noDerivations")}
          </p>
          <button
            onClick={() => setStatusFilter("all")}
            className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
          >
            {t("showAll")}
          </button>
        </div>
      )}

      {/* ---- Generate More button ---- */}
      <div className="flex justify-center pt-4 animate-fade-in" style={{ animationDelay: "300ms" }}>
        <button
          onClick={onGenerateMore}
          disabled={isGeneratingMore || generationMode === "format_adaptation"}
          className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={14} />
          {isGeneratingMore
            ? commonT("loading")
            : generationMode === "format_adaptation"
              ? t("formatAdaptationComplete")
              : t("generateMore")}
        </button>
      </div>

      {/* ---- Bulk Actions Bar ---- */}
      {isSelectionMode && (
        <BulkActionsBar
          selectedCount={selectedIds.length}
          onApproveAll={() => {
            selectedIds.forEach((id) => onApprove?.(id));
            clearSelection();
          }}
          onRejectAll={() => {
            selectedIds.forEach((id) => onReject?.(id));
            clearSelection();
          }}
          onExportAll={() => {
            selectedIds.forEach((id) => onDownload?.(id));
            clearSelection();
          }}
          onDownloadZip={handleBulkDownloadZip}
          onCreateShareLink={handleBulkCreateShareLink}
          onClear={clearSelection}
          isApproving={!!approvingId}
          isRejecting={!!rejectingId}
          isExporting={false}
          isDownloadingZip={zipExport.isPending}
          isCreatingShareLink={shareLink.isPending}
        />
      )}

      {/* ---- Comparison Modal ---- */}
      {selectedIds.length === 2 && (
        <DerivationComparisonModal
          derivationA={filteredDerivations.find((d) => d.id === selectedIds[0])!}
          derivationB={filteredDerivations.find((d) => d.id === selectedIds[1])!}
          open={isCompareOpen}
          onOpenChange={(open) => {
            setIsCompareOpen(open);
            if (!open) clearSelection();
          }}
          onApproveA={() => {
            onApprove?.(selectedIds[0]);
            setIsCompareOpen(false);
            clearSelection();
          }}
          onApproveB={() => {
            onApprove?.(selectedIds[1]);
            setIsCompareOpen(false);
            clearSelection();
          }}
          onRejectBoth={() => {
            onReject?.(selectedIds[0]);
            onReject?.(selectedIds[1]);
            setIsCompareOpen(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}
