"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import type {
  FeedbackCategory,
  FeedbackContextPayload,
  FeedbackSeverity,
  FeedbackType,
} from "@/lib/feedback/types";

type FeedbackModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: FeedbackContextPayload;
  submitting: boolean;
  onSubmit: (input: {
    type: FeedbackType;
    severity: FeedbackSeverity;
    category: FeedbackCategory;
    message: string;
    followUpAllowed: boolean;
  }) => Promise<void>;
};

export default function FeedbackModal({
  open,
  onOpenChange,
  context,
  submitting,
  onSubmit,
}: FeedbackModalProps) {
  const t = useTranslations("feedback");
  const [type, setType] = useState<FeedbackType>("bug");
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [category, setCategory] = useState<FeedbackCategory>("ui");
  const [message, setMessage] = useState("");
  const [followUpAllowed, setFollowUpAllowed] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (context.contextKind === "derivation") {
      setCategory("generation");
      setType("bug");
    } else if (context.contextKind === "campaign") {
      setCategory("generation");
    }
  }, [open, context.contextKind]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    await onSubmit({
      type,
      severity,
      category,
      message: message.trim(),
      followUpAllowed,
    });
    setMessage("");
    setFollowUpAllowed(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="feedback-type">{t("type")}</Label>
            <select
              id="feedback-type"
              value={type}
              onChange={(e) => setType(e.target.value as FeedbackType)}
              className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
            >
              <option value="bug">{t("types.bug")}</option>
              <option value="suggestion">{t("types.suggestion")}</option>
              <option value="question">{t("types.question")}</option>
              <option value="other">{t("types.other")}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="feedback-severity">{t("severity")}</Label>
              <select
                id="feedback-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
                className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
              >
                <option value="low">{t("severities.low")}</option>
                <option value="medium">{t("severities.medium")}</option>
                <option value="high">{t("severities.high")}</option>
                <option value="critical">{t("severities.critical")}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="feedback-category">{t("category")}</Label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
              >
                <option value="ui">{t("categories.ui")}</option>
                <option value="generation">{t("categories.generation")}</option>
                <option value="billing">{t("categories.billing")}</option>
                <option value="performance">{t("categories.performance")}</option>
                <option value="other">{t("categories.other")}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="feedback-message">{t("message")}</Label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={t("messagePlaceholder")}
              className="min-h-[120px] rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={followUpAllowed}
              onChange={(e) => setFollowUpAllowed(e.target.checked)}
              className="mt-1"
            />
            {t("followUp")}
          </label>

          <p className="text-xs text-[var(--text-muted)]">{t("privacyNote")}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
          >
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
