"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AssistantGoalPresentation } from "@/lib/assistant/goal";
import { assistantQuietCommitClass } from "./assistant-chrome";

export interface GoalPackageReviewProps {
  packageItems: AssistantGoalPresentation["packageItems"];
  approvedFormatCount: number;
  requiredFormatCount: number;
  onApprove: (versionId: string) => void;
  onAnnotate: (versionId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  approved: "approved",
  ready: "ready",
  running: "running",
  failed: "failed",
  pending: "pending",
  stale: "stale",
};

/**
 * Four-format package review. Each format is a separate slot with its own
 * status, preview, history, annotate/revise, and approve action. There is no
 * approve-all button: completion requires all four formats to be approved
 * individually. A content-changing request routes back to base revision and the
 * derivatives show as stale.
 */
export default function GoalPackageReview({
  packageItems,
  approvedFormatCount,
  requiredFormatCount,
  onApprove,
  onAnnotate,
}: GoalPackageReviewProps) {
  const t = useTranslations("assistant.goal");

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="assistant-package-review"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("candidates")}
        </h3>
        <span
          className="text-xs text-[var(--text-muted)]"
          data-testid="assistant-package-progress"
        >
          {approvedFormatCount}/{requiredFormatCount}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {packageItems.map((item) => {
          const approved = item.status === "approved";
          const ready = item.status === "ready";
          const canApprove = ready && item.versionId;
          return (
            <div
              key={item.format}
              data-testid={`assistant-package-slot-${item.format}`}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-[var(--surface-raised)] p-3",
                approved
                  ? "border-[var(--success-border)]"
                  : "border-[var(--border-dim)]"
              )}
            >
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-[var(--surface-inset)]">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={item.format}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
                    {t(STATUS_LABEL[item.status] ?? "pending")}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {item.format}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t(STATUS_LABEL[item.status] ?? "pending")}
                </span>
              </div>
              <div className="flex gap-2">
                {item.versionId ? (
                  <button
                    type="button"
                    data-testid={`assistant-package-annotate-${item.format}`}
                    onClick={() => item.versionId && onAnnotate(item.versionId)}
                    className="flex-1 rounded-md border border-[var(--border-dim)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {t("annotate")}
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid={`assistant-package-approve-${item.format}`}
                  disabled={!canApprove || approved}
                  onClick={() => item.versionId && onApprove(item.versionId)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium",
                    approved
                      ? "bg-[var(--success-bg)] text-[var(--success-text)]"
                      : canApprove
                        ? assistantQuietCommitClass
                        : "cursor-not-allowed bg-[var(--surface-inset)] text-[var(--text-muted)]"
                  )}
                >
                  {approved ? t("selected") : t("selectBase")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
