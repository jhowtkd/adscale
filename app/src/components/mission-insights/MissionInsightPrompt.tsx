"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FlaskConical, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MISSION_INSIGHT_REASONS } from "@/lib/mission-insights/reasons";
import type {
  MissionInsightPromptContext,
  MissionInsightReason,
  MissionInsightSentiment,
} from "@/lib/mission-insights/types";

type MissionInsightPromptProps = {
  open: boolean;
  context: MissionInsightPromptContext;
  submitting: boolean;
  onDismiss: () => void;
  onSkip: () => void;
  onSubmit: (input: {
    sentiment: MissionInsightSentiment;
    reason: MissionInsightReason;
    optionalText?: string;
  }) => Promise<void>;
};

const SENTIMENTS: MissionInsightSentiment[] = ["positive", "neutral", "negative"];

export default function MissionInsightPrompt({
  open,
  context,
  submitting,
  onDismiss,
  onSkip,
  onSubmit,
}: MissionInsightPromptProps) {
  const t = useTranslations("missionInsights");
  const [sentiment, setSentiment] = useState<MissionInsightSentiment>("neutral");
  const [reason, setReason] = useState<MissionInsightReason>("other");
  const [optionalText, setOptionalText] = useState("");

  const reasons = MISSION_INSIGHT_REASONS[context.moment] ?? ["other"];

  const handleSubmit = async () => {
    await onSubmit({
      sentiment,
      reason,
      optionalText: optionalText.trim() || undefined,
    });
    setSentiment("neutral");
    setReason("other");
    setOptionalText("");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden border-[var(--accent-green)]/20">
        <div className="border-b border-[var(--border-dim)] bg-[var(--accent-green)]/5 px-5 py-4">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical size={18} className="text-[var(--accent-green)] shrink-0" />
                <DialogTitle className="text-base">{t("title")}</DialogTitle>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={t("dismiss")}
              >
                <X size={16} />
              </button>
            </div>
            <DialogDescription className="text-sm text-[var(--text-secondary)]">
              {t(`moments.${context.moment}.prompt`)}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
              {t("sentimentLabel")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {SENTIMENTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSentiment(value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    sentiment === value
                      ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--accent-green-text)]"
                      : "border-[var(--border-dim)] text-[var(--text-secondary)] hover:border-[var(--accent-green)]/40"
                  )}
                >
                  {t(`sentiments.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mission-insight-reason">{t("reasonLabel")}</Label>
            <select
              id="mission-insight-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as MissionInsightReason)}
              className="h-10 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
            >
              {reasons.map((value) => (
                <option key={value} value={value}>
                  {t(`reasons.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mission-insight-note">{t("optionalNote")}</Label>
            <textarea
              id="mission-insight-note"
              value={optionalText}
              onChange={(e) => setOptionalText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t("optionalNotePlaceholder")}
              className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm"
            />
          </div>

          <p className="text-[11px] text-[var(--text-muted)]">{t("privacyNote")}</p>
        </div>

        <DialogFooter className="border-t border-[var(--border-dim)] px-5 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip} disabled={submitting}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onDismiss} disabled={submitting}>
              {t("dismiss")}
            </Button>
            <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
