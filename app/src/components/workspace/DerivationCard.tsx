"use client";

import Image from "next/image";

import {
  Eye,
  Download,
  RefreshCw,
  Clock,
  AlertCircle,
  Check,
  X,
  Package,
  ShieldCheck,
  BookmarkPlus,
  Scale,
  PenTool,
  MoreHorizontal,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";

import { useExport } from "@/lib/hooks/use-export";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdscaleLoader } from "@/components/animations";
import { useAppStore } from "@/lib/store";
import { scoreCappedForDisplay } from "@/lib/derivation-display";
import {
  getExportDisplay,
  getOlharDisplay,
  getPackageEligibilityHintKey,
  isNormalApprovalBlocked,
  verdictBadgeClassName,
} from "@/lib/derivation-display";
import { DerivationAutoRetryBadge } from "@/components/workspace/DerivationAutoRetryBadge";

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
  onCompare?: () => void;
  onAnnotate?: () => void;
  isCompareMode?: boolean;
  qaAnalyzingId?: string | null;
  interactionState?: {
    selectedForCompare?: boolean;
    savingReference?: boolean;
    approving?: boolean;
    rejecting?: boolean;
  };
  regeneratingId?: string | null;
  gridSize?: "small" | "medium" | "large";
}

// ============================================
// Status Overlay Component
// ============================================

type DerivationDisplayStatus = Derivation["status"] | "queued";

function StatusOverlay({ status, onRetry }: { status: DerivationDisplayStatus; onRetry?: () => void }) {
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
          <AdscaleLoader size="sm" label={commonT("loading")} />
          <span className="text-xs font-medium text-[var(--text-primary)] mt-2">
            {commonT("loading")}
          </span>
        </div>
      );

    case "failed":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-t-[15px] bg-[var(--danger-bg)]">
          <AlertCircle size={24} className="mb-2 text-[var(--danger-text)]" />
          <span className="text-sm font-medium text-[var(--danger-text)]">{t("failed")}</span>
          <button type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
            className="mt-2 inline-flex items-center rounded-md border border-[var(--danger-border)] px-3 py-1.5 text-xs font-medium text-[var(--danger-text)] hover:bg-[var(--danger-bg)] transition-colors"
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
// Main Component
// ============================================

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
  onCompare,
  onAnnotate,
  qaAnalyzingId,
  interactionState,
  regeneratingId,
}: DerivationCardProps) {
  const t = useTranslations("derivation");
  const tr = useTranslations("review");
  const commonT = useTranslations("common");
  const toastT = useTranslations("toast");
  const locale = useLocale();
  const isCompleted = derivation.status === "completed";
  const platformStyle = platformColors[derivation.platform] || {
    bg: "var(--neutral-bg)",
    text: "var(--neutral-text)",
  };

  const isGeneratingOverlay =
    derivation.status === "generating" && !derivation.imageUrl;

  const isRegenerating = regeneratingId === derivation.id;
  const isQaAnalyzing = qaAnalyzingId === derivation.id;
  const isSelectedForCompare = interactionState?.selectedForCompare ?? false;
  const isSavingReference = interactionState?.savingReference ?? false;
  const isApproving = interactionState?.approving ?? false;
  const isRejecting = interactionState?.rejecting ?? false;
  const exportMutation = useExport();
  const addToast = useAppStore((s) => s.addToast);

  const qaStatusColor = (
    {
      ready: "text-[var(--success-text)]",
      warning: "text-[var(--warning-text)]",
      review: "text-[var(--danger-text)]",
    } as Record<string, string>
  )[derivation.qaStatus ?? ""] ?? "text-[var(--text-muted)]";
  const qaLabelKey = getQaLabelKey(derivation.qaStatus);

  const aspectClass = {
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
    "9:16": "aspect-[9/16]",
  }[derivation.format ?? ""] ?? "aspect-square";

  const displayScore = scoreCappedForDisplay(
    derivation.qualityScore,
    derivation.qualityVerdict
  );
  const olharDisplay = getOlharDisplay(derivation.olharVerdict);
  const exportDisplay = getExportDisplay(derivation.exportStatus);
  const packageBlockedHintKey = getPackageEligibilityHintKey(derivation);
  const approvalBlocked = isNormalApprovalBlocked(derivation);
  const isApprovedWithImage =
    derivation.status === "approved" && Boolean(derivation.imageUrl);
  const canPreview = isCompleted && Boolean(derivation.imageUrl);
  const showOverflowMenu =
    derivation.status === "completed" ||
    derivation.status === "approved" ||
    derivation.status === "failed" ||
    Boolean(derivation.imageUrl);
  const generatedAtLabel = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(derivation.createdAt);

  const handleRegenerate = (feedback?: string) => {
    if (isRegenerating) return;
    const preset =
      feedback ??
      derivation.regenerationSuggestion ??
      (derivation.hardFailures?.length
        ? derivation.hardFailures.map((f) => `${f.code}: ${f.message}`).join("; ")
        : undefined);
    onRegenerate?.(derivation.id, preset);
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
        "animate-fade-in group rounded-[15px] border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden transition-all duration-300",
        derivation.isPreview
          ? "border-dashed border-[var(--warning-border)]"
          : "",
        isCompleted && !derivation.isPreview && "hover:border-[var(--border-medium)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]",
        isSelectedForCompare && "ring-2 ring-[var(--selection-border)] border-[var(--selection-border)] bg-[var(--selection-bg)]"
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* ---- Image Area ---- */}
      <div
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        className={cn(
          "relative block w-full overflow-hidden rounded-lg bg-muted border-0 p-0 text-left",
          aspectClass,
          canPreview && "cursor-pointer"
        )}
        onClick={canPreview ? () => onPreview(derivation.id) : undefined}
        onKeyDown={
          canPreview
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onPreview(derivation.id);
              }
            : undefined
        }
      >
        {derivation.imageUrl ? (
          <Image
            src={derivation.imageUrl}
            alt={derivation.name}
            className={cn(
              "size-full object-contain transition-transform duration-300",
              isCompleted && "group-hover:scale-[1.03]"
            )}
            loading="lazy"
            width={800}
            height={800}
            unoptimized
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
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-1 text-xs font-medium text-[var(--warning-text)]">
              {t("previewBadge")}
            </span>
          </div>
        )}

        {/* Status overlay */}
        {(derivation.status === "failed" || isGeneratingOverlay) && (
          <StatusOverlay
            status={derivation.status === "failed" ? "failed" : "generating"}
            onRetry={handleRegenerate}
          />
        )}
      </div>

      {/* ---- Info Area ---- */}
      <div className="p-3.5 space-y-2">
        {/* Row 1: Name + date, then verdict badges on their own wrapping row */}
        <div className="space-y-1.5 min-w-0">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {derivation.name}
            </h4>
            <p className="truncate text-[10px] text-[var(--text-muted)]">
              {t("generatedAt", { dateTime: generatedAtLabel })}
            </p>
          </div>
          <div
            data-derivation-badges
            className="flex flex-wrap items-center gap-1.5"
          >
            {olharDisplay ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                  verdictBadgeClassName(olharDisplay.tone)
                )}
              >
                <span className="text-[9px] uppercase tracking-wide opacity-70 mr-1">
                  {tr("olharLabel")}
                </span>
                {tr(olharDisplay.labelKey)}
              </span>
            ) : null}
            {exportDisplay ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                  verdictBadgeClassName(exportDisplay.tone)
                )}
              >
                <span className="text-[9px] uppercase tracking-wide opacity-70 mr-1">
                  {tr("exportacaoLabel")}
                </span>
                {tr(exportDisplay.labelKey)}
              </span>
            ) : null}
            {!olharDisplay && derivation.qualityVerdict === "invalid" ? (
              <span className="inline-flex items-center rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--danger-text)]">
                {t("invalidOutputBadge")}
              </span>
            ) : null}
            {!olharDisplay && derivation.qualityVerdict === "improvable" ? (
              <span className="inline-flex items-center rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning-text)]">
                {t("improvableOutputBadge")}
              </span>
            ) : null}
            <DerivationAutoRetryBadge derivation={derivation} />
            {displayScore != null && (
              <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)]/60 px-1.5 py-0.5 opacity-80">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  {tr("qualityScore")}
                </span>
                <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                  {displayScore}
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

        {packageBlockedHintKey ? (
          <p className="text-[11px] text-[var(--danger-text)] leading-snug">
            {tr(packageBlockedHintKey)}
          </p>
        ) : null}

        {derivation.olharVerdict?.directionNote ? (
          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-snug">
            {derivation.olharVerdict.directionNote}
          </p>
        ) : null}

        {derivation.qualityVerdict === "invalid" &&
        derivation.hardFailures &&
        derivation.hardFailures.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2">
            {derivation.hardFailures.slice(0, 3).map((failure) => {
              const title = tr(`hardFailureCodes.${failure.code}` as "hardFailureCodes.cta_drift");
              const detail =
                failure.message && failure.message !== title
                  ? failure.message.length > 120
                    ? `${failure.message.slice(0, 117)}...`
                    : failure.message
                  : null;
              return (
                <li key={failure.code} className="text-[11px] text-[var(--danger-text)] leading-snug">
                  <span className="font-medium">{title}</span>
                  {detail ? (
                    <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{detail}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {derivation.qualityVerdict === "improvable" &&
        derivation.polishSuggestions &&
        derivation.polishSuggestions.length > 0 ? (
          <p className="line-clamp-2 text-[11px] text-[var(--warning-text)]">
            {derivation.polishSuggestions[0]}
          </p>
        ) : null}

        {derivation.scoreIssues?.[0] && (
          <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
            {derivation.scoreIssues[0]}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <div className="flex items-center gap-1">
            {showOverflowMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t("moreActions", { name: derivation.name })}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-[var(--utility-icon)]",
                    "opacity-70 transition-opacity duration-[var(--duration-fast)]",
                    "hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] hover:opacity-100",
                    "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
                    "group-hover:opacity-100"
                  )}
                >
                  <MoreHorizontal size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
                  <DropdownMenuItem
                    onClick={() => onPreview(derivation.id)}
                    className="flex items-center gap-2"
                  >
                    <Eye size={14} />
                    {commonT("preview")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDownload}
                    disabled={exportMutation.isPending || Boolean(derivation.isPreview)}
                    className="flex items-center gap-2"
                  >
                    <Download size={14} />
                    {derivation.isPreview ? t("downloadFinalVersion") : commonT("download")}
                  </DropdownMenuItem>
                  {onRegenerate ? (
                    <DropdownMenuItem
                      onClick={() => handleRegenerate()}
                      disabled={isRegenerating}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw size={14} />
                      {commonT("regenerate")}
                    </DropdownMenuItem>
                  ) : null}
                  {derivation.regenerationSuggestion && onRegenerate ? (
                    <DropdownMenuItem
                      onClick={() =>
                        onRegenerate(derivation.id, derivation.regenerationSuggestion || "")
                      }
                      disabled={isRegenerating}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw size={14} />
                      {t("regenerateWithImprovements")}
                    </DropdownMenuItem>
                  ) : null}
                  {isCompleted ? (
                    <>
                      {onAnnotate ? (
                        <DropdownMenuItem
                          onClick={onAnnotate}
                          className="flex items-center gap-2"
                        >
                          <PenTool size={14} />
                          {t("annotate")}
                        </DropdownMenuItem>
                      ) : null}
                      {onCompare ? (
                        <DropdownMenuItem
                          onClick={onCompare}
                          className="flex items-center gap-2"
                        >
                          <Scale size={14} />
                          {t("compare")}
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}
                  {isApprovedWithImage ? (
                    <>
                      <DropdownMenuSeparator />
                      {onRunQa ? (
                        <DropdownMenuItem
                          onClick={onRunQa}
                          disabled={isQaAnalyzing}
                          className="flex items-center gap-2"
                        >
                          <ShieldCheck size={14} />
                          {derivation.qaStatus && derivation.qaStatus !== "pending"
                            ? t("rerunQa")
                            : t("runQa")}
                        </DropdownMenuItem>
                      ) : null}
                      {onSaveAsReference ? (
                        <DropdownMenuItem
                          onClick={onSaveAsReference}
                          disabled={isSavingReference}
                          className="flex items-center gap-2"
                        >
                          <BookmarkPlus size={14} />
                          {t("saveAsReference")}
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {/* Stage primary actions */}
        {derivation.status === "completed" && onApprove && onReject ? (
          <div className="mt-2 flex flex-col gap-2">
            {approvalBlocked ? (
              <Button
                size="sm"
                onClick={() => handleRegenerate()}
                disabled={isRegenerating}
                className="w-fit bg-[var(--danger-bg)] text-[var(--danger-text)] hover:bg-[var(--danger-border)]"
              >
                <RefreshCw className="mr-1 size-4" />
                {t("regenerateWithFixes")}
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="min-h-9 flex-1 bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] sm:flex-none"
                onClick={onApprove}
                disabled={isApproving || approvalBlocked}
                title={
                  approvalBlocked
                    ? packageBlockedHintKey
                      ? tr(packageBlockedHintKey)
                      : t("approveBlockedInvalid")
                    : undefined
                }
              >
                <Check className="mr-1 size-4" />
                {commonT("approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-9"
                onClick={onReject}
                disabled={isRejecting}
              >
                <X className="mr-1 size-4" />
                {commonT("reject")}
              </Button>
            </div>
          </div>
        ) : null}

        {isApprovedWithImage ? (
          <div className="mt-2 flex flex-col gap-2">
            {onCreateDeliveryPackage ? (
              <Button
                size="sm"
                onClick={onCreateDeliveryPackage}
                className="min-h-9 w-fit bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]"
              >
                <Package className="mr-1 size-4" />
                {t("generatePackage")}
              </Button>
            ) : null}
            {qaLabelKey ? (
              <span className={cn("text-xs font-medium", qaStatusColor)}>{t(qaLabelKey)}</span>
            ) : null}
            {derivation.qaIssues && derivation.qaIssues.length > 0 ? (
              <p className="line-clamp-1 text-[11px] text-[var(--text-muted)]">
                {derivation.qaIssues[0]}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
