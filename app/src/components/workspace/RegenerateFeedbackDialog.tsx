"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface RegenerateFeedbackDialogProps {
  open: boolean;
  initialFeedback?: string;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (feedback: string) => void;
}

export default function RegenerateFeedbackDialog({
  open,
  initialFeedback = "",
  isSubmitting = false,
  onOpenChange,
  onConfirm,
}: RegenerateFeedbackDialogProps) {
  const t = useTranslations("review");
  const [feedback, setFeedback] = useState(initialFeedback);

  useEffect(() => {
    if (open) {
      setFeedback(initialFeedback);
    }
  }, [open, initialFeedback]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("regenerateWithFixesTitle")}</DialogTitle>
          <DialogDescription>{t("regenerateWithFixesDescription")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={t("feedbackPlaceholder")}
          rows={6}
          className="resize-y min-h-[120px]"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || !feedback.trim()}
            onClick={() => onConfirm(feedback.trim())}
          >
            {t("regenerateWithFixesConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DerivationLoadErrorBannerProps {
  kind: string;
  onRetry?: () => void;
}

export function DerivationLoadErrorBanner({ kind, onRetry }: DerivationLoadErrorBannerProps) {
  const te = useTranslations("campaign.errors");
  const title = te.has(`${kind}.title`) ? te(`${kind}.title`) : te("unknown.title");
  const description = te.has(`${kind}.description`) ? te(`${kind}.description`) : te("unknown.description");

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3",
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      )}
      role="alert"
    >
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
      </div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {te("retry")}
        </Button>
      ) : null}
    </div>
  );
}
