"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RegenerationIssueBreakdown } from "@/lib/regeneration-preview-types";

interface RegenerateFeedbackDialogProps {
  open: boolean;
  initialFeedback?: string;
  primaryReason?: string;
  issueBreakdown?: RegenerationIssueBreakdown;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (feedback: string) => void;
}

interface RegenerateFeedbackFormProps {
  initialFeedback: string;
  primaryReason?: string;
  issueBreakdown?: RegenerationIssueBreakdown;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (feedback: string) => void;
}

function IssueSummary({
  primaryReason,
  issueBreakdown,
}: {
  primaryReason?: string;
  issueBreakdown?: RegenerationIssueBreakdown;
}) {
  const t = useTranslations("review");

  if (!primaryReason && !issueBreakdown) {
    return null;
  }

  const blockingHard = issueBreakdown?.hardFailures ?? [];
  const blockingQa = issueBreakdown?.qaFailed ?? [];
  const scoreIssues = issueBreakdown?.scoreIssues ?? [];
  const advisory = issueBreakdown?.qaWarnings ?? [];
  const hasBlocking =
    blockingHard.length > 0 || blockingQa.length > 0 || scoreIssues.length > 0;
  const hasAdvisory = advisory.length > 0;

  if (!primaryReason && !hasBlocking && !hasAdvisory) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-3 space-y-3 text-sm">
      <p className="font-medium text-[var(--text-primary)]">{t("regenerationWhatWeFix")}</p>
      {primaryReason ? (
        <p className="text-[var(--text-secondary)]">{primaryReason}</p>
      ) : null}
      {hasBlocking ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1">
            {t("regenerationBlocking")}
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-secondary)]">
            {blockingHard.map((failure) => (
              <li key={`${failure.code}-${failure.message}`}>
                <span className="font-medium text-[var(--text-primary)]">
                  {t.has(`hardFailureCodes.${failure.code}`)
                    ? t(`hardFailureCodes.${failure.code}`)
                    : failure.code}
                </span>
                {failure.message ? (
                  <span className="text-[var(--text-secondary)]"> — {failure.message}</span>
                ) : null}
              </li>
            ))}
            {blockingQa.map((item) => (
              <li key={`qa-failed-${item.criterion}`}>
                <span className="font-medium">{item.criterion}</span>
                {item.note ? <span> — {item.note}</span> : null}
              </li>
            ))}
            {scoreIssues.map((issue) => (
              <li key={`score-${issue}`}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasAdvisory ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1">
            {t("regenerationAdvisory")}
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-secondary)]">
            {advisory.map((item) => (
              <li key={`qa-warn-${item.criterion}`}>
                <span className="font-medium">{item.criterion}</span>
                {item.note ? <span> — {item.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RegenerateFeedbackForm({
  initialFeedback,
  primaryReason,
  issueBreakdown,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: RegenerateFeedbackFormProps) {
  const t = useTranslations("review");
  const [feedback, setFeedback] = useState(initialFeedback);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("regenerateWithFixesTitle")}</DialogTitle>
        <DialogDescription>{t("regenerateWithFixesDescription")}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <IssueSummary primaryReason={primaryReason} issueBreakdown={issueBreakdown} />
        <Textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={t("feedbackPlaceholder")}
          rows={6}
          className="resize-y min-h-[120px]"
        />
      </DialogBody>
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
    </>
  );
}

export default function RegenerateFeedbackDialog({
  open,
  initialFeedback = "",
  primaryReason,
  issueBreakdown,
  isSubmitting = false,
  onOpenChange,
  onConfirm,
}: RegenerateFeedbackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {open ? (
          <RegenerateFeedbackForm
            key={`${initialFeedback}-${primaryReason ?? ""}`}
            initialFeedback={initialFeedback}
            primaryReason={primaryReason}
            issueBreakdown={issueBreakdown}
            isSubmitting={isSubmitting}
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
          />
        ) : null}
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
