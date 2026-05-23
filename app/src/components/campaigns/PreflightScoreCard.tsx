"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  AlertTriangle,

  Lightbulb,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  BarChart3,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { PreflightResult } from "@/server/ai/preflight-analysis";

// ============================================
// Types
// ============================================

interface PreflightScoreCardProps {
  result?: PreflightResult | null;
  status?: "pending" | "analyzing" | "completed" | "failed" | "empty";
  onReanalyze?: () => void;
  className?: string;
}

// ============================================
// Helpers
// ============================================

function scoreColor(score: number): string {
  if (score >= 80) return "text-[var(--accent-teal)]";
  if (score >= 50) return "text-[var(--accent-amber)]";
  return "text-[var(--accent-rose)]";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-[var(--accent-teal)]";
  if (score >= 50) return "bg-[var(--accent-amber)]";
  return "bg-[var(--accent-rose)]";
}

function scoreBorder(score: number): string {
  if (score >= 80) return "border-[var(--accent-teal)]/30";
  if (score >= 50) return "border-[var(--accent-amber)]/30";
  return "border-[var(--accent-rose)]/30";
}

// ============================================
// Sub-components
// ============================================

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className={cn("font-semibold", scoreColor(score))}>{score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--border-dim)] overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", scoreBg(score))}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function AnalyzingCard() {
  const t = useTranslations("preflight");
  const steps = [
    t("stepTechnical"),
    t("stepText"),
    t("stepVisual"),
    t("stepComposition"),
    t("stepPlatform"),
  ];

  return (
    <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <RefreshCw size={20} className="animate-spin text-[var(--accent-mint)]" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t("analyzingTitle")}</h4>
          <p className="text-xs text-[var(--text-muted)]">{t("analyzingSubtitle")}</p>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <motion.div
            key={step}
            className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15 }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-mint)] animate-pulse" />
            {step}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function PreflightScoreCard({
  result,
  status = "empty",
  onReanalyze,
  className,
}: PreflightScoreCardProps) {
  const t = useTranslations("preflight");
  const [showDetails, setShowDetails] = useState(true);

  if (status === "empty" || status === "pending") {
    return null;
  }

  if (status === "analyzing") {
    return (
      <div className={className}>
        <AnalyzingCard />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className={className}>
        <div className="rounded-xl border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-[var(--accent-rose)]" />
            <p className="text-sm text-[var(--accent-rose)]">{t("analysisFailed")}</p>
          </div>
          {onReanalyze && (
            <button
              onClick={onReanalyze}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-base)] transition-all"
            >
              <RefreshCw size={12} />
              {t("reanalyze")}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const dims = result.breakdown;
  const dimensionEntries = [
    { key: "technicalQuality", label: t("dimTechnicalQuality"), value: dims.technicalQuality },
    { key: "textLegibility", label: t("dimTextLegibility"), value: dims.textLegibility },
    { key: "visualHierarchy", label: t("dimVisualHierarchy"), value: dims.visualHierarchy },
    { key: "ctaProminence", label: t("dimCtaProminence"), value: dims.ctaProminence },
    { key: "composition", label: t("dimComposition"), value: dims.composition },
    { key: "brandConsistency", label: t("dimBrandConsistency"), value: dims.brandConsistency },
    { key: "platformReadiness", label: t("dimPlatformReadiness"), value: dims.platformReadiness },
  ];

  const hasCriticalIssues = result.criticalIssues.length > 0 || result.overallScore < 50;

  return (
    <motion.div
      className={cn(
        "rounded-xl border bg-[var(--surface-raised)] overflow-hidden",
        scoreBorder(result.overallScore),
        className
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 pb-0">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold",
              result.overallScore >= 80
                ? "bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]"
                : result.overallScore >= 50
                  ? "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]"
                  : "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)]"
            )}
          >
            {result.overallScore}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h4>
            <p className="text-xs text-[var(--text-muted)]">
              {result.overallScore >= 80
                ? t("statusExcellent")
                : result.overallScore >= 50
                  ? t("statusFair")
                  : t("statusPoor")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onReanalyze && (
            <button
              onClick={onReanalyze}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)] transition-all"
            >
              <RefreshCw size={12} />
              {t("reanalyze")}
            </button>
          )}
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="inline-flex items-center rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)] transition-all"
            aria-label={showDetails ? t("collapse") : t("expand")}
          >
            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Critical warning banner */}
      <AnimatePresence>
        {hasCriticalIssues && (
          <motion.div
            className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 px-3 py-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--accent-rose)]" />
            <p className="text-xs text-[var(--accent-rose)]">{t("criticalWarning")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            className="space-y-4 p-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {/* Score bars */}
            <div className="space-y-3">
              {dimensionEntries.map((dim) => (
                <ScoreBar key={dim.key} label={dim.label} score={dim.value.score} />
              ))}
            </div>

            {/* Critical issues */}
            {result.criticalIssues.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-[var(--accent-rose)]" />
                  <span className="text-xs font-semibold text-[var(--accent-rose)]">
                    {t("criticalIssues")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.criticalIssues.map((issue, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-md border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 px-2 py-1 text-[11px] font-medium text-[var(--accent-rose)]"
                    >
                      {issue}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-[var(--accent-amber)]" />
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    {t("suggestions")}
                  </span>
                </div>
                <ul className="space-y-2">
                  {result.suggestions.map((suggestion, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2"
                    >
                      <span className="text-xs text-[var(--text-primary)] leading-relaxed">
                        {suggestion}
                      </span>

                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Technical summary */}
            <div className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BarChart3 size={14} className="text-[var(--text-muted)]" />
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  {t("technicalSummary")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("actualDimensions")}: {result.technical.actualWidth}×{result.technical.actualHeight}px
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("aspectRatio")}: {result.technical.aspectRatio}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("format")}: {result.technical.format.toUpperCase()}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("contrast")}: {Math.round(result.technical.estimatedContrast * 100)}%
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("transparency")}: {result.technical.hasAlpha ? t("yes") : t("no")}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("fileSize")}: {(result.technical.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
