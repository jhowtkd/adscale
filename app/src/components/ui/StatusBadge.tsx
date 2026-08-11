"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type ProductStatus =
  | "draft"
  | "active"
  | "queued"
  | "processing"
  | "generating"
  | "completed"
  | "approved"
  | "rejected"
  | "failed";

interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

const PRODUCT_STATUSES = new Set<string>([
  "draft",
  "active",
  "queued",
  "processing",
  "generating",
  "completed",
  "approved",
  "rejected",
  "failed",
]);

const statusTokenClass: Record<ProductStatus, string> = {
  draft: "bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]",
  active: "bg-[var(--status-active-bg)] text-[var(--status-active-text)]",
  queued: "bg-[var(--status-queued-bg)] text-[var(--status-queued-text)]",
  processing:
    "bg-[var(--status-processing-bg)] text-[var(--status-processing-text)]",
  generating:
    "bg-[var(--status-generating-bg)] text-[var(--status-generating-text)]",
  completed:
    "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]",
  approved:
    "bg-[var(--status-approved-bg)] text-[var(--status-approved-text)]",
  rejected:
    "bg-[var(--status-rejected-bg)] text-[var(--status-rejected-text)]",
  failed: "bg-[var(--status-failed-bg)] text-[var(--status-failed-text)]",
};

const statusDotClass: Record<ProductStatus, string> = {
  draft: "bg-[var(--status-draft-dot)]",
  active: "bg-[var(--status-active-dot)]",
  queued: "bg-[var(--status-queued-dot)] animate-pulse-dot",
  processing: "bg-[var(--status-processing-dot)] animate-pulse-dot",
  generating: "bg-[var(--status-generating-dot)] animate-pulse-dot",
  completed: "bg-[var(--status-completed-dot)]",
  approved: "bg-[var(--status-approved-dot)]",
  rejected: "bg-[var(--status-rejected-dot)]",
  failed: "bg-[var(--status-failed-dot)]",
};

function isProductStatus(status: string): status is ProductStatus {
  return PRODUCT_STATUSES.has(status);
}

export default function StatusBadge({
  status,
  showDot = true,
  className,
}: StatusBadgeProps) {
  const t = useTranslations("campaign");
  const known = isProductStatus(status);
  const label = known ? t(`status.${status}`) : status;
  const tokenClass = known
    ? statusTokenClass[status]
    : "bg-[var(--neutral-bg)] text-[var(--neutral-text)]";
  const dotClass = known
    ? statusDotClass[status]
    : "bg-[var(--neutral-dot)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-pill)] px-[var(--space-3)] py-[var(--space-1)] font-mono text-[length:var(--text-caption)] font-bold uppercase tracking-[0.2em] leading-tight",
        tokenClass,
        className
      )}
    >
      {showDot && (
        <span
          className={cn("inline-block size-1.5 rounded-full", dotClass)}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
