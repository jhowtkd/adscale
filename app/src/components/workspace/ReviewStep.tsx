"use client";

import { useState } from "react";
import {
  Check,
  X,
  FileArchive,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import ComparisonView from "./ComparisonView";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface ReviewStepProps {
  derivations: Derivation[];
  baseImageUrl?: string;
  onApprove?: (id: string) => void;
  onReject?: (id: string, reason: string) => void;
  onRegenerate?: (id: string, feedback: string) => void;
  onDownload?: (id: string, format: string) => void;
  onExportAll?: (format: string) => void;
  approvingId?: string | null;
  rejectingId?: string | null;
  regeneratingId?: string | null;
  downloadingId?: string | null;
  isExporting?: boolean;
}

// ============================================
// Component
// ============================================

export default function ReviewStep({
  derivations,
  baseImageUrl,
  onApprove,
  onReject,
  onRegenerate,
  onDownload,
  onExportAll,
  approvingId,
  rejectingId,
  regeneratingId,
  downloadingId,
  isExporting: isExportingProp,
}: ReviewStepProps) {
  const [selectedDerivationId, setSelectedDerivationId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState("png");
  const [showComparison, setShowComparison] = useState(false);

  // Filter only completed derivations for review
  const reviewableDerivations = derivations.filter((d) => d.status === "completed");

  const approvedCount = reviewedIds.size;
  const totalCount = reviewableDerivations.length;

  const selectedDerivation =
    reviewableDerivations.find((d) => d.id === selectedDerivationId) || null;

  const isExporting = isExportingProp ?? false;

  const handleApprove = (id: string) => {
    setReviewedIds((prev) => new Set([...prev, id]));
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onApprove?.(id);
  };

  const handleReject = (id: string, _reason: string) => {
    setRejectedIds((prev) => new Set([...prev, id]));
    setReviewedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onReject?.(id, _reason);
  };

  const handleRegenerate = (id: string, feedback: string) => {
    onRegenerate?.(id, feedback);
  };

  const handleDownload = (id: string, format: string) => {
    onDownload?.(id, format);
  };

  const handleExportAll = () => {
    onExportAll?.(exportFormat);
  };

  const handlePrevDerivation = () => {
    if (!selectedDerivationId) return;
    const idx = reviewableDerivations.findIndex((d) => d.id === selectedDerivationId);
    if (idx > 0) {
      setSelectedDerivationId(reviewableDerivations[idx - 1].id);
    }
  };

  const handleNextDerivation = () => {
    if (!selectedDerivationId) return;
    const idx = reviewableDerivations.findIndex((d) => d.id === selectedDerivationId);
    if (idx < reviewableDerivations.length - 1) {
      setSelectedDerivationId(reviewableDerivations[idx + 1].id);
    }
  };

  // Card overlay states
  const getCardBorderClass = (id: string) => {
    if (reviewedIds.has(id)) return "border-[var(--accent-teal)]";
    if (rejectedIds.has(id)) return "border-[var(--accent-rose)]";
    return "border-[var(--border-dim)]";
  };

  const isApprovingSelected = approvingId === selectedDerivationId;
  const isRejectingSelected = rejectingId === selectedDerivationId;
  const isRegeneratingSelected = regeneratingId === selectedDerivationId;
  const isDownloadingSelected = downloadingId === selectedDerivationId;

  return (
    <div className="space-y-6">
      {/* ---- Header Stats ---- */}
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-in">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {approvedCount}/{totalCount} approved
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-[200px] h-1.5 bg-[var(--border-dim)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-teal)] rounded-full transition-all duration-500"
                  style={{
                    width: totalCount > 0 ? `${(approvedCount / totalCount) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">Export format:</span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="h-9 px-3 text-xs rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] focus:border-[var(--accent-green)] focus:outline-none"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </div>

          <button
            onClick={handleExportAll}
            disabled={approvedCount === 0 || isExporting}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
              approvedCount > 0 && !isExporting
                ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
                : "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-not-allowed"
            )}
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <FileArchive size={16} />
                Export All Approved
              </>
            )}
          </button>
        </div>
      </div>

      {/* ---- Comparison View (when a derivation is selected) ---- */}
      {showComparison && selectedDerivation && (
        <div className="overflow-hidden animate-fade-in">
          <div className="glass-card rounded-xl p-4">
            {/* Comparison header */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Compare: {selectedDerivation.name}
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevDerivation}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-[var(--text-muted)]">
                  {reviewableDerivations.findIndex((d) => d.id === selectedDerivationId) + 1} /{" "}
                  {totalCount}
                </span>
                <button
                  onClick={handleNextDerivation}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowComparison(false);
                    setSelectedDerivationId(null);
                  }}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[rgba(244,63,94,0.08)] transition-colors ml-2"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <ComparisonView
              baseImageUrl={baseImageUrl}
              derivation={selectedDerivation}
              onApprove={handleApprove}
              onReject={handleReject}
              onRegenerate={handleRegenerate}
              onDownload={handleDownload}
              isApproving={isApprovingSelected}
              isRejecting={isRejectingSelected}
              isRegenerating={isRegeneratingSelected}
              isDownloading={isDownloadingSelected}
            />
          </div>
        </div>
      )}

      {/* ---- Review Grid ---- */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {reviewableDerivations.map((derivation, i) => {
          const isApproved = reviewedIds.has(derivation.id);
          const isRejected = rejectedIds.has(derivation.id);
          const isSelected = selectedDerivationId === derivation.id;
          const platformStyle = platformColors[derivation.platform as keyof typeof platformColors] || { bg: "var(--surface-raised)", text: "var(--text-muted)" };

          return (
            <div
              key={derivation.id}
              onClick={() => {
                setSelectedDerivationId(derivation.id);
                setShowComparison(true);
              }}
              className={cn(
                "group relative bg-[var(--surface-base)] rounded-xl border-2 overflow-hidden cursor-pointer transition-all duration-300 animate-fade-in",
                getCardBorderClass(derivation.id),
                isSelected && "ring-2 ring-[var(--accent-green)] ring-offset-1 ring-offset-[var(--deep-bg)]",
                !isApproved && !isRejected && "hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              )}
              style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
            >
              {/* Approved overlay */}
              {isApproved && (
                <div className="absolute top-2 left-2 z-10">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-teal)] flex items-center justify-center">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                </div>
              )}

              {/* Approved badge */}
              {isApproved && (
                <div className="absolute top-2 right-2 z-10">
                  <StatusBadge status="completed" showDot={false} className="text-[10px] py-0.5 px-2" />
                </div>
              )}

              {/* Rejected badge */}
              {isRejected && (
                <div className="absolute top-2 right-2 z-10">
                  <StatusBadge status="failed" showDot={false} className="text-[10px] py-0.5 px-2" />
                </div>
              )}

              {/* Approved tint */}
              {isApproved && (
                <div className="absolute inset-0 bg-[var(--accent-green-dim)] pointer-events-none z-[1]" />
              )}

              {/* Rejected tint */}
              {isRejected && (
                <div className="absolute inset-0 bg-[rgba(244,63,94,0.05)] pointer-events-none z-[1]" />
              )}

              {/* Image area */}
              <div className="relative aspect-[4/5] overflow-hidden">
                {derivation.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={derivation.imageUrl}
                    alt={derivation.name}
                    className={cn(
                      "absolute inset-0 w-full h-full object-cover transition-all duration-300",
                      isRejected && "grayscale-[60%]"
                    )}
                    loading="lazy"
                  />
                ) : (
                  <div
                    className={cn(
                      "absolute inset-0 transition-all duration-300",
                      isRejected && "grayscale-[60%]"
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${platformStyle.bg} 0%, var(--surface-raised) 100%)`,
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        className="text-4xl font-bold opacity-20"
                        style={{ color: platformStyle.text }}
                      >
                        {derivation.name.charAt(0)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-[2]">
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(derivation.id);
                      }}
                      disabled={approvingId === derivation.id}
                      className="w-10 h-10 rounded-full bg-[var(--accent-green)] flex items-center justify-center text-white shadow-lg hover:bg-[var(--accent-green)]/90 transition-all duration-200 hover:scale-110 active:scale-90 disabled:opacity-60"
                    >
                      {approvingId === derivation.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check size={18} />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(derivation.id, "");
                      }}
                      disabled={rejectingId === derivation.id}
                      className="w-10 h-10 rounded-full bg-[var(--accent-rose)] flex items-center justify-center text-white shadow-lg hover:bg-[var(--accent-rose)]/90 transition-all duration-200 hover:scale-110 active:scale-90 disabled:opacity-60"
                    >
                      {rejectingId === derivation.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <X size={18} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {derivation.name}
                </h4>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                  {derivation.prompt}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: platformStyle.bg,
                      color: platformStyle.text,
                    }}
                  >
                    {derivation.platform}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    ~{derivation.creditCost} cr
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {reviewableDerivations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 glass-card rounded-xl">
          <p className="text-sm text-[var(--text-muted)] mb-2">No completed derivations to review.</p>
          <p className="text-xs text-[var(--text-muted)]">
            Wait for generation to complete or go back to generate more.
          </p>
        </div>
      )}

      {/* ---- Gallery Strip at bottom ---- */}
      {reviewableDerivations.length > 0 && (
        <div className="glass-card rounded-xl p-4 animate-fade-in" style={{ animationDelay: "300ms" }}>
          <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">
            All Derivations ({reviewableDerivations.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {reviewableDerivations.map((d) => {
              const isApproved = reviewedIds.has(d.id);
              const isRejected = rejectedIds.has(d.id);
              const isSelected = selectedDerivationId === d.id;

              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setSelectedDerivationId(d.id);
                    setShowComparison(true);
                  }}
                  className={cn(
                    "relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200",
                    isSelected
                      ? "border-[var(--accent-blue)]"
                      : isApproved
                      ? "border-[var(--accent-teal)]"
                      : isRejected
                      ? "border-[var(--accent-rose)]"
                      : "border-transparent hover:border-[var(--border-medium)]"
                  )}
                >
                  <div
                    className="w-full h-full"
                    style={{
                      background: `linear-gradient(135deg, ${platformColors[d.platform]?.bg || "var(--surface-raised)"} 0%, var(--surface-raised) 100%)`,
                    }}
                  />
                  {isApproved && (
                    <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-[var(--accent-teal)] flex items-center justify-center">
                      <Check size={8} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
