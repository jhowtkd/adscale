"use client";

import { useEffect, useCallback } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import { useTranslations } from "next-intl";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Download,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useExport } from "@/lib/hooks/use-export";
import { useAppStore } from "@/lib/store";
import CopyVariantsPanel from "./CopyVariantsPanel";

// ============================================
// Types
// ============================================

interface DerivationPreviewModalProps {
  derivations: Derivation[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (index: number) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRegenerate?: (id: string, feedback?: string) => void;
  onDownload?: (id: string) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  regeneratingId?: string | null;
}

// ============================================
// Helpers
// ============================================

function getScoreLabel(score: number | null | undefined, t: (key: string) => string) {
  if (score == null) return null;
  if (score >= 80) return t("scoreStrong");
  if (score >= 60) return t("scoreAdjust");
  return t("scoreWeak");
}

function getQaLabelKey(status: string | null | undefined) {
  if (status === "ready") return "qaReady";
  if (status === "warning") return "qaWarning";
  if (status === "review") return "qaReview";
  return null;
}

function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin",
        className
      )}
    />
  );
}

// ============================================
// Component
// ============================================

export default function DerivationPreviewModal({
  derivations,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  onApprove,
  onReject,
  onRegenerate,
  onDownload,
  isApproving,
  isRejecting,
  regeneratingId,
}: DerivationPreviewModalProps) {
  const t = useTranslations("derivation");
  const commonT = useTranslations("common");
  const toastT = useTranslations("toast");
  const addToast = useAppStore((s) => s.addToast);
  const exportMutation = useExport();

  const derivation = derivations[currentIndex] ?? null;
  const total = derivations.length;

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < total - 1;

  const handlePrev = useCallback(() => {
    if (canGoPrev) onNavigate?.(currentIndex - 1);
  }, [canGoPrev, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (canGoNext) onNavigate?.(currentIndex + 1);
  }, [canGoNext, currentIndex, onNavigate]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Keyboard navigation (← →)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext]);

  if (!isOpen || !derivation) return null;

  const platformStyle = platformColors[derivation.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };

  const qaStatusColor = (
    {
      ready: "text-[var(--accent-green)]",
      warning: "text-amber-500",
      review: "text-[var(--accent-rose)]",
    } as Record<string, string>
  )[derivation.qaStatus ?? ""] ?? "text-[var(--text-muted)]";

  const qaLabelKey = getQaLabelKey(derivation.qaStatus);
  const scoreLabel = getScoreLabel(derivation.qualityScore, t);
  const isRegenerating = regeneratingId === derivation.id;
  const isCompleted = derivation.status === "completed";

  const handleDownload = () => {
    if (exportMutation.isPending || derivation.isPreview) return;
    exportMutation.mutate(
      { type: "individual", derivationId: derivation.id, format: "png" },
      {
        onSuccess: () => {
          onDownload?.(derivation.id);
        },
        onError: (err) => {
          addToast(
            "error",
            err instanceof Error ? err.message : toastT("exportFailed")
          );
        },
      }
    );
  };

  const handleRegenerate = () => {
    if (isRegenerating) return;
    onRegenerate?.(derivation.id);
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/80 transition-opacity duration-200"
          onClick={handleClose}
        />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex outline-none">
          {/* ---- Image Area ---- */}
          <div className="flex-1 flex items-center justify-center relative bg-black/20">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all duration-150"
              aria-label={commonT("close")}
            >
              <X size={20} />
            </button>

            {/* Counter */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-black/40 text-white/80 text-sm font-medium">
              {currentIndex + 1} / {total}
            </div>

            {/* Previous */}
            {canGoPrev && (
              <button
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all duration-150"
                aria-label={commonT("back")}
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* Next */}
            {canGoNext && (
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all duration-150"
                aria-label={commonT("next")}
              >
                <ChevronRight size={28} />
              </button>
            )}

            {/* Image */}
            {derivation.imageUrl ? (
              <img
                src={derivation.imageUrl}
                alt={derivation.name}
                className="max-h-[85vh] max-w-[90%] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <div
                className="w-[60vw] max-w-[600px] h-[60vh] rounded-lg flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${platformStyle.bg} 0%, var(--surface-raised) 50%, ${platformStyle.bg} 100%)`,
                }}
              >
                <span
                  className="text-6xl font-bold opacity-20"
                  style={{ color: platformStyle.text }}
                >
                  {derivation.name.charAt(0)}
                </span>
              </div>
            )}
          </div>

          {/* ---- Sidebar ---- */}
          <div className="w-[360px] flex-shrink-0 bg-[var(--deep-bg)] border-l border-[var(--border-dim)] flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-[var(--border-dim)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                {derivation.name}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={derivation.status} showDot={false} />
                {derivation.qualityScore != null && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]">
                    {derivation.qualityScore}
                    {scoreLabel && (
                      <span className="text-[10px] text-[var(--text-muted)] font-normal">
                        {scoreLabel}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="p-5 space-y-5 flex-1 overflow-y-auto">
              {/* Platform */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium block mb-1.5">
                  {commonT("platforms")}
                </span>
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: platformStyle.bg,
                    color: platformStyle.text,
                  }}
                >
                  {derivation.platform}
                </span>
              </div>

              {/* Format */}
              {derivation.format && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium block mb-1.5">
                    {t("format")}
                  </span>
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {derivation.format}
                  </span>
                </div>
              )}

              {/* CTA */}
              {derivation.ctaText && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium block mb-1.5">
                    CTA
                  </span>
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {derivation.ctaText}
                  </span>
                </div>
              )}

              {/* Copy Variants */}
              {derivation.id && (
                <CopyVariantsPanel derivationId={derivation.id} />
              )}

              {/* Score breakdown */}
              {derivation.scoreBreakdown && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium block mb-2">
                    {t("creativeScore")}
                  </span>
                  <div className="space-y-2">
                    {Object.entries(derivation.scoreBreakdown)
                      .filter(([, value]) => value != null)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-[var(--text-secondary)] capitalize">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {value}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* QA */}
              {derivation.qaStatus && derivation.qaStatus !== "pending" && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium block mb-2">
                    QA
                  </span>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck size={16} className={qaStatusColor} />
                    <span className={cn("text-sm font-medium", qaStatusColor)}>
                      {qaLabelKey ? t(qaLabelKey) : derivation.qaStatus}
                    </span>
                  </div>
                  {derivation.qaIssues && derivation.qaIssues.length > 0 && (
                    <ul className="space-y-1">
                      {derivation.qaIssues.map((issue, i) => (
                        <li
                          key={i}
                          className="text-xs text-[var(--text-muted)] flex items-start gap-1.5"
                        >
                          <AlertCircle
                            size={12}
                            className="mt-0.5 flex-shrink-0 text-[var(--accent-rose)]"
                          />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Prompt */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium block mb-1.5">
                  Prompt
                </span>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-raised)] rounded-lg p-3 border border-[var(--border-dim)]">
                  {derivation.prompt}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-5 border-t border-[var(--border-dim)] space-y-3 bg-[var(--surface-base)]">
              {isCompleted && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green)]/90"
                    onClick={() => onApprove?.(derivation.id)}
                    disabled={isApproving}
                  >
                    {isApproving ? (
                      <Spinner className="mr-1" />
                    ) : (
                      <Check size={16} className="mr-1" />
                    )}
                    {commonT("approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-[var(--accent-rose)] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10"
                    onClick={() => onReject?.(derivation.id)}
                    disabled={isRejecting}
                  >
                    {isRejecting ? (
                      <Spinner className="mr-1" />
                    ) : (
                      <X size={16} className="mr-1" />
                    )}
                    {commonT("reject")}
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <Spinner className="mr-1" />
                  ) : (
                    <RefreshCw size={16} className="mr-1" />
                  )}
                  {commonT("regenerate")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={handleDownload}
                  disabled={exportMutation.isPending || derivation.isPreview}
                >
                  {exportMutation.isPending ? (
                    <Spinner className="mr-1" />
                  ) : (
                    <Download size={16} className="mr-1" />
                  )}
                  {commonT("download")}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
