"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface DerivationComparisonModalProps {
  derivationA: Derivation;
  derivationB: Derivation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproveA?: () => void;
  onApproveB?: () => void;
  onRejectBoth?: () => void;
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

// ============================================
// Comparison Column
// ============================================

function ComparisonColumn({
  derivation,
  label,
  t,
}: {
  derivation: Derivation;
  label: string;
  t: (key: string) => string;
}) {
  const platformStyle = platformColors[derivation.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };
  const aspectClass =
    {
      "1:1": "aspect-square",
      "4:5": "aspect-[4/5]",
      "9:16": "aspect-[9/16]",
    }[derivation.format ?? ""] ?? "aspect-square";

  const qaLabelKey = getQaLabelKey(derivation.qaStatus);
  const qaStatusColor = (
    {
      ready: "text-[var(--accent-mint)]",
      warning: "text-amber-500",
      review: "text-[var(--accent-rose)]",
    } as Record<string, string>
  )[derivation.qaStatus ?? ""] ?? "text-[var(--text-muted)]";

  return (
    <div className="flex flex-col gap-4">
      {/* Label */}
      <div className="flex items-center justify-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
      </div>

      {/* Image */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-muted border border-[var(--border-dim)]",
          aspectClass
        )}
      >
        {derivation.imageUrl ? (
          /* eslint-disable @next/next/no-img-element */
          <img
            src={derivation.imageUrl}
            alt={derivation.name}
            className="w-full h-full object-contain max-h-[60vh]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, 
                ${platformStyle.bg} 0%, 
                var(--surface-raised) 50%, 
                ${platformStyle.bg} 100%)`,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-6xl font-bold opacity-20"
                style={{ color: platformStyle.text }}
              >
                {derivation.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          {derivation.name}
        </h4>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium"
            style={{
              backgroundColor: platformStyle.bg,
              color: platformStyle.text,
            }}
          >
            {derivation.platform}
          </span>
          {derivation.format && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.format}
            </span>
          )}
          {derivation.ctaText && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.ctaText}
            </span>
          )}
        </div>

        {derivation.qualityScore != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {t("creativeScore")}:
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {derivation.qualityScore}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {getScoreLabel(derivation.qualityScore, t)}
            </span>
          </div>
        )}

        {qaLabelKey && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {t("qaStatus")}:
            </span>
            <span className={cn("text-xs font-medium", qaStatusColor)}>
              {t(qaLabelKey)}
            </span>
          </div>
        )}

        <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
          {derivation.prompt}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function DerivationComparisonModal({
  derivationA,
  derivationB,
  open,
  onOpenChange,
  onApproveA,
  onApproveB,
  onRejectBoth,
}: DerivationComparisonModalProps) {
  const t = useTranslations("derivation");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[calc(100%-2rem)] p-0 overflow-hidden sm:max-w-6xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
            {t("compareTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ComparisonColumn derivation={derivationA} label="A" t={t} />
            <ComparisonColumn derivation={derivationB} label="B" t={t} />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-[var(--border-dim)] bg-[var(--surface-base)]">
          <Button
            variant="outline"
            onClick={onApproveA}
            className="border-[var(--accent-mint)] text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
          >
            {t("approveA")}
          </Button>
          <Button
            variant="outline"
            onClick={onApproveB}
            className="border-[var(--accent-mint)] text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
          >
            {t("approveB")}
          </Button>
          <Button
            variant="outline"
            onClick={onRejectBoth}
            className="border-[var(--accent-rose)] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10"
          >
            {t("rejectBoth")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
