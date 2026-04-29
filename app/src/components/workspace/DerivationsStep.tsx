"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import DerivationCard from "./DerivationCard";
import type { Derivation } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface DerivationsStepProps {
  derivations: Derivation[];
  generationMode?: "art_variation" | "format_adaptation";
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  onRegenerate: (id: string) => void;
  onGenerateMore: () => void;
  onReviewAll: () => void;
  isGeneratingMore?: boolean;
}

type GridSize = "small" | "medium" | "large";
type SortOption = "newest" | "oldest" | "angle" | "status";
type StatusFilter = "all" | "completed" | "generating" | "failed";

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
  onReviewAll,
  isGeneratingMore,
}: DerivationsStepProps) {
  const t = useTranslations("derivation");
  const commonT = useTranslations("common");
  const [gridSize, setGridSize] = useState<GridSize>("medium");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Filter and sort derivations
  const filteredDerivations = useMemo(() => {
    let filtered = [...derivations];

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((d) => d.status === statusFilter);
    }

    // Sort
    switch (sortBy) {
      case "newest":
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "oldest":
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        break;
      case "status":
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
      default:
        break;
    }

    return filtered;
  }, [derivations, sortBy, statusFilter]);

  // Stats
  const completedCount = derivations.filter((d) =>
    ["completed", "approved", "rejected"].includes(d.status)
  ).length;
  const activeCount = derivations.filter((d) =>
    ["queued", "processing", "generating"].includes(d.status)
  ).length;
  const failedCount = derivations.filter((d) => d.status === "failed").length;
  const totalCount = derivations.length;
  const isAllCompleted = totalCount > 0 && completedCount === totalCount;
  const totalCredits = derivations.reduce((sum, d) => sum + d.creditCost, 0);

  // Grid classes
  const gridClasses = {
    small: "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
    medium: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
    large: "grid-cols-[repeat(auto-fill,minmax(340px,1fr))]",
  };

  return (
    <div className="space-y-5">
      {/* ---- Stats Bar ---- */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        {/* Left: Progress */}
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {completedCount}/{totalCount} {t("variationsGenerated")}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-[200px] h-1.5 bg-[var(--border-dim)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full gradient-progress rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : "0%",
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Meta info + controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span>~{totalCredits.toFixed(1)} {commonT("credits")}</span>
            <span className="mx-1">\u00b7</span>
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
            <option value="newest">{commonT("newest")}</option>
            <option value="oldest">{commonT("oldest")}</option>
            <option value="angle">{t("byAngle")}</option>
            <option value="status">{t("byStatus")}</option>
          </select>
        </div>
      </motion.div>

      {/* ---- Status Filter Pills ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 flex-wrap"
      >
        {(["all", "completed", "generating", "failed"] as StatusFilter[]).map((filter) => {
          const count =
            filter === "all"
              ? derivations.length
              : derivations.filter((d) => d.status === filter).length;
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
      </motion.div>

      {/* ---- All Completed Banner ---- */}
      <AnimatePresence>
        {isAllCompleted && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between bg-[var(--accent-mint-dim)] border border-[var(--accent-mint)]/20 rounded-lg px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Check size={18} className="text-[var(--accent-teal)]" />
              <span className="text-sm font-medium text-[var(--accent-mint)]">
                {t("allCompleted")}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onReviewAll}
              className="text-sm font-medium text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
            >
              {t("goToReview")}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Derivations Grid ---- */}
      {filteredDerivations.length > 0 ? (
        <div className={cn("grid gap-4", gridClasses[gridSize])}>
          {filteredDerivations.map((derivation, i) => (
            <DerivationCard
              key={derivation.id}
              derivation={derivation}
              index={i}
              onPreview={onPreview}
              onDownload={onDownload}
              onRegenerate={onRegenerate}
              gridSize={gridSize}
            />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)]"
        >
          <p className="text-sm text-[var(--text-muted)] mb-4">
            {t("noDerivations")}
          </p>
          <button
            onClick={() => setStatusFilter("all")}
            className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
          >
            {t("showAll")}
          </button>
        </motion.div>
      )}

      {/* ---- Generate More button ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex justify-center pt-4"
      >
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
      </motion.div>
    </div>
  );
}
