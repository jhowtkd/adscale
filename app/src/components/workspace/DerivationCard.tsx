"use client";

/* eslint-disable @next/next/no-img-element */

import { Eye, Download, RefreshCw, Clock, AlertCircle, Check, X, Package, ShieldCheck, BookmarkPlus, FileText, Users, Scale, PenTool } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";

import { useExport } from "@/lib/hooks/use-export";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

// ============================================
// Types
// ============================================

interface DerivationCardProps {
  derivation: Derivation;
  index: number;
  onPreview: (id: string) => void;
  onDownload?: (id: string) => void;
  onRegenerate?: (id: string, feedback?: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onCreateDeliveryPackage?: () => void;
  onRunQa?: () => void;
  onSaveAsReference?: () => void;
  onGenerateLandingPage?: () => void;
  onSimulatePersonas?: () => void;
  onCompare?: () => void;
  onAnnotate?: () => void;
  isCompareMode?: boolean;
  isSelectedForCompare?: boolean;
  qaAnalyzingId?: string | null;
  isSavingReference?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  regeneratingId?: string | null;
  landingPageGeneratingId?: string | null;
  simulatingPersonasId?: string | null;
  gridSize?: "small" | "medium" | "large";
}

// ============================================
// Progress Ring Component
// ============================================

function ProgressRing({ progress }: { progress: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={64} height={64} viewBox="0 0 64 64">
        {/* Background circle */}
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke="var(--border-dim)"
          strokeWidth={3}
        />
        {/* Progress circle */}
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
          transform="rotate(-90 32 32)"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent-mint)" />
            <stop offset="100%" stopColor="var(--accent-mint)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-sm font-semibold text-[var(--text-primary)]">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

// ============================================
// Status Overlay Component
// ============================================

type DerivationDisplayStatus = Derivation["status"] | "queued";

function StatusOverlay({ status, progress, onRetry }: { status: DerivationDisplayStatus; progress?: number; onRetry?: () => void }) {
  const t = useTranslations("derivation");
  const commonT = useTranslations("common");
  switch (status) {
    case "queued":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 rounded-t-[15px]">
          <Clock size={24} className="text-[var(--text-muted)] mb-2" />
          <span className="text-xs font-medium text-[var(--text-muted)]">{t("queued")}</span>
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {t("waiting")}
          </span>
        </div>
      );

    case "generating":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 rounded-t-[15px]">
          <ProgressRing progress={progress || 0} />
          <span className="text-xs font-medium text-[var(--text-primary)] mt-2">
            {commonT("loading")}
          </span>
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
            ~8s {t("remaining")}
          </span>
        </div>
      );

    case "failed":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(244,63,94,0.15)] rounded-t-[15px]">
          <AlertCircle size={24} className="text-[var(--accent-rose)] mb-2" />
          <span className="text-sm text-[var(--accent-rose)] font-medium">{t("failed")}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
            className="mt-2 inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border border-[var(--accent-rose)]/30 text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-colors"
          >
            {commonT("retry")}
          </button>
        </div>
      );

    default:
      return null;
  }
}

// ============================================
// Spinner Component
// ============================================

function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin", className)}
    />
  );
}

// ============================================
// Main Component
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

export default function DerivationCard({
  derivation,
  index,
  onPreview,
  onDownload,
  onRegenerate,
  onApprove,
  onReject,
  onCreateDeliveryPackage,
  onRunQa,
  onSaveAsReference,
  onGenerateLandingPage,
  onSimulatePersonas,
  onCompare,
  onAnnotate,
  isCompareMode,
  isSelectedForCompare,
  qaAnalyzingId,
  isSavingReference,
  isApproving,
  isRejecting,
  regeneratingId,
  landingPageGeneratingId,
  simulatingPersonasId,
}: DerivationCardProps) {
  const t = useTranslations("derivation");
  const commonT = useTranslations("common");
  const toastT = useTranslations("toast");
  const isCompleted = derivation.status === "completed";
  const platformStyle = platformColors[derivation.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };

  // Simulated progress per derivation
  const simulatedProgress = Math.min(10 + ((index * 37 + 42) % 90), 98);

  const isRegenerating = regeneratingId === derivation.id;
  const isQaAnalyzing = qaAnalyzingId === derivation.id;
  const isGeneratingLandingPage = landingPageGeneratingId === derivation.id;
  const isSimulatingPersonas = simulatingPersonasId === derivation.id;
  const exportMutation = useExport();
  const addToast = useAppStore((s) => s.addToast);

  const qaStatusColor = (
    {
      ready: "text-[var(--accent-mint)]",
      warning: "text-amber-500",
      review: "text-[var(--accent-rose)]",
    } as Record<string, string>
  )[derivation.qaStatus ?? ""] ?? "text-[var(--text-muted)]";
  const qaLabelKey = getQaLabelKey(derivation.qaStatus);

  const aspectClass = {
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
    "9:16": "aspect-[9/16]",
  }[derivation.format ?? ""] ?? "aspect-square";

  const handleRegenerate = () => {
    if (isRegenerating) return;
    onRegenerate?.(derivation.id);
  };

  const handleDownload = () => {
    if (exportMutation.isPending) return;
    exportMutation.mutate(
      { type: "individual", derivationId: derivation.id, format: "png" },
      {
        onSuccess: () => {
          onDownload?.(derivation.id);
        },
        onError: (err) => {
          addToast("error", err instanceof Error ? err.message : toastT("exportFailed"));
        },
      }
    );
  };

  return (
    <div
      className={cn(
        "animate-fade-in group bg-[var(--surface-base)] rounded-[15px] border overflow-hidden transition-all duration-300",
        derivation.isPreview
          ? "border-dashed border-orange-400/60"
          : "border-[var(--border-dim)]",
        isCompleted && !derivation.isPreview && "hover:border-[var(--border-medium)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] hover:-translate-y-1",
        isSelectedForCompare && "ring-2 ring-[var(--accent-mint)] border-[var(--accent-mint)]"
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* ---- Image Area ---- */}
      <div className={cn("relative overflow-hidden rounded-lg bg-muted", aspectClass)}>
        {derivation.imageUrl ? (
          <img
            src={derivation.imageUrl}
            alt={derivation.name}
            className={cn(
              "w-full h-full object-contain transition-transform duration-300",
              isCompleted && "group-hover:scale-[1.03]"
            )}
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              "absolute inset-0 transition-transform duration-300",
              isCompleted && "group-hover:scale-[1.03]"
            )}
            style={{
              background: `linear-gradient(135deg, 
                ${platformStyle.bg} 0%, 
                var(--surface-raised) 50%, 
                ${platformStyle.bg} 100%)`,
            }}
          >
            {/* Center icon/initial */}
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

        {/* Preview badge */}
        {derivation.isPreview && (
          <div className="absolute top-2 right-2 z-10">
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium px-2 py-1 border border-dashed border-orange-400">
              {t("previewBadge")}
            </span>
          </div>
        )}

        {/* Status overlay */}
        <StatusOverlay
          status={derivation.status}
          progress={derivation.status === "generating" ? simulatedProgress : undefined}
          onRetry={handleRegenerate}
        />
      </div>

      {/* ---- Info Area ---- */}
      <div className="p-3.5 space-y-2">
        {/* Row 1: Name + Status */}
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {derivation.name}
          </h4>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {derivation.qualityScore != null && (
              <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {derivation.qualityScore}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {getScoreLabel(derivation.qualityScore, t)}
                </span>
              </div>
            )}
            <StatusBadge status={derivation.status} showDot={false} />
          </div>
        </div>

        {/* Row 2: Label + CTA */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: platformStyle.bg,
              color: platformStyle.text,
            }}
          >
            {derivation.platform}
          </span>
          {derivation.ctaText && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.ctaText}
            </span>
          )}
          {derivation.format && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {derivation.format}
            </span>
          )}
        </div>

        {/* Row 3: Prompt preview */}
        <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {derivation.prompt}
        </p>
        {derivation.scoreIssues?.[0] && (
          <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
            {derivation.scoreIssues[0]}
          </p>
        )}

        {/* Row 4: Cost + Actions */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[var(--text-muted)]">
            ~{derivation.creditCost} {commonT("credits")}
          </span>

          <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity duration-200">
            {derivation.regenerationSuggestion && (
              <button
                onClick={() => onRegenerate?.(derivation.id, derivation.regenerationSuggestion || "")}
                disabled={isRegenerating}
                aria-label={t("regenerateDerivationWithImprovements", { name: derivation.name })}
                className={cn(
                  "p-1.5 rounded-md text-[var(--accent-blue)] hover:text-[var(--accent-blue-light)] hover:bg-[var(--accent-blue)]/10 transition-all duration-150",
                  isRegenerating && "opacity-50 cursor-wait"
                )}
                title={t("regenerateWithImprovements")}
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              onClick={() => onPreview(derivation.id)}
              aria-label={t("previewDerivation", { name: derivation.name })}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
              title={commonT("preview")}
            >
              <Eye size={16} />
            </button>
            <button
              onClick={handleDownload}
              disabled={exportMutation.isPending || derivation.isPreview}
              aria-label={t("downloadDerivation", { name: derivation.name })}
              className={cn(
                "p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150",
                (exportMutation.isPending || derivation.isPreview) && "opacity-50 cursor-not-allowed"
              )}
              title={derivation.isPreview ? t("downloadFinalVersion") : commonT("download")}
            >
              {exportMutation.isPending ? (
                <Spinner />
              ) : (
                <Download size={16} />
              )}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              aria-label={t("regenerateDerivation", { name: derivation.name })}
              className={cn(
                "p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150",
                isRegenerating && "opacity-50 cursor-wait"
              )}
              title={commonT("regenerate")}
            >
              {isRegenerating ? (
                <Spinner />
              ) : (
                <RefreshCw size={16} />
              )}
            </button>
            {isCompleted && (
              <>
                <button
                  onClick={onAnnotate}
                  aria-label={t("annotate")}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
                  title={t("annotate")}
                >
                  <PenTool size={16} />
                </button>
                <button
                  onClick={onCompare}
                  aria-label={t("compare")}
                  className={cn(
                    "p-1.5 rounded-md transition-all duration-150",
                    isSelectedForCompare
                      ? "text-[var(--accent-mint)] bg-[var(--accent-mint)]/10"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                  )}
                  title={t("compare")}
                >
                  <Scale size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 5: Approve / Reject */}
        {derivation.status === "completed" && onApprove && onReject && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={onApprove} disabled={isApproving}>
              <Check className="w-4 h-4 mr-1" />
              {commonT("approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={isRejecting}>
              <X className="w-4 h-4 mr-1" />
              {commonT("reject")}
            </Button>
          </div>
        )}

        {/* Row 6: QA + Delivery Package */}
        {derivation.status === "approved" && derivation.imageUrl && (
          <div className="flex flex-col gap-2 mt-2">
            {onCreateDeliveryPackage && (
              <Button
                size="sm"
                onClick={onCreateDeliveryPackage}
                className="w-fit bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)]"
              >
                <Package className="w-4 h-4 mr-1" />
                {t("generatePackage")}
              </Button>
            )}
            {onRunQa && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRunQa}
                  disabled={isQaAnalyzing}
                  className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                >
                  {isQaAnalyzing ? (
                    <Spinner className="mr-1" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 mr-1" />
                  )}
                  {derivation.qaStatus && derivation.qaStatus !== "pending" ? t("rerunQa") : t("runQa")}
                </Button>
                {qaLabelKey && (
                  <span className={cn("text-xs font-medium", qaStatusColor)}>
                    {t(qaLabelKey)}
                  </span>
                )}
              </div>
            )}
            {derivation.qaIssues && derivation.qaIssues.length > 0 && (
              <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                {derivation.qaIssues[0]}
              </p>
            )}
            {onSaveAsReference && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSaveAsReference}
                disabled={isSavingReference}
                className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] w-fit"
              >
                {isSavingReference ? (
                  <Spinner className="mr-1" />
                ) : (
                  <BookmarkPlus className="w-4 h-4 mr-1" />
                )}
                {t("saveAsReference")}
              </Button>
            )}
            {onGenerateLandingPage && (
              <Button
                size="sm"
                variant="outline"
                onClick={onGenerateLandingPage}
                disabled={isGeneratingLandingPage}
                className="border-[var(--accent-blue)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 w-fit"
              >
                {isGeneratingLandingPage ? (
                  <Spinner className="mr-1" />
                ) : (
                  <FileText className="w-4 h-4 mr-1" />
                )}
                {t("generateLandingPage")}
              </Button>
            )}
            {onSimulatePersonas && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSimulatePersonas}
                disabled={isSimulatingPersonas}
                className="border-[var(--accent-purple)] text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 w-fit"
              >
                {isSimulatingPersonas ? (
                  <Spinner className="mr-1" />
                ) : (
                  <Users className="w-4 h-4 mr-1" />
                )}
                {t("simulatePersonas")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
