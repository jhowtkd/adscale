"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

const statusConfig: Record<
  string,
  { dotColor: string; bgColor: string; textColor: string }
> = {
  draft: {
    dotColor: "var(--status-draft-dot)",
    bgColor: "var(--status-draft-bg)",
    textColor: "var(--status-draft-text)",
  },
  active: {
    dotColor: "var(--status-active-dot)",
    bgColor: "var(--status-active-bg)",
    textColor: "var(--status-active-text)",
  },
  queued: {
    dotColor: "var(--status-queued-dot)",
    bgColor: "var(--status-queued-bg)",
    textColor: "var(--status-queued-text)",
  },
  processing: {
    dotColor: "var(--status-processing-dot)",
    bgColor: "var(--status-processing-bg)",
    textColor: "var(--status-processing-text)",
  },
  generating: {
    dotColor: "var(--status-generating-dot)",
    bgColor: "var(--status-generating-bg)",
    textColor: "var(--status-generating-text)",
  },
  completed: {
    dotColor: "var(--status-completed-dot)",
    bgColor: "var(--status-completed-bg)",
    textColor: "var(--status-completed-text)",
  },
  approved: {
    dotColor: "var(--status-approved-dot)",
    bgColor: "var(--status-approved-bg)",
    textColor: "var(--status-approved-text)",
  },
  rejected: {
    dotColor: "var(--status-rejected-dot)",
    bgColor: "var(--status-rejected-bg)",
    textColor: "var(--status-rejected-text)",
  },
  failed: {
    dotColor: "var(--status-failed-dot)",
    bgColor: "var(--status-failed-bg)",
    textColor: "var(--status-failed-text)",
  },
};

export default function StatusBadge({
  status,
  showDot = true,
  className,
}: StatusBadgeProps) {
  const t = useTranslations("campaign");
  const config = statusConfig[status] ?? {
    dotColor: "#94a3b8",
    bgColor: "rgba(148,163,184,0.15)",
    textColor: "#94a3b8",
  };
  const label = statusConfig[status] ? t(`status.${status}`) : status;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] leading-tight",
        className
      )}
      style={{
        backgroundColor: config.bgColor,
        color: config.textColor,
      }}
    >
      {showDot && (
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            (status === "generating" || status === "processing" || status === "queued") && "animate-pulse-dot"
          )}
          style={{ backgroundColor: config.dotColor }}
        />
      )}
      {label}
    </span>
  );
}
