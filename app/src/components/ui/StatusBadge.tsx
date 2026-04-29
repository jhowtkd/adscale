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
    dotColor: "#475569",
    bgColor: "rgba(71,85,105,0.15)",
    textColor: "#94a3b8",
  },
  active: {
    dotColor: "var(--accent-mint)",
    bgColor: "var(--accent-mint-dim)",
    textColor: "var(--accent-mint)",
  },
  queued: {
    dotColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.15)",
    textColor: "#fbbf24",
  },
  processing: {
    dotColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.15)",
    textColor: "#fbbf24",
  },
  generating: {
    dotColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.15)",
    textColor: "#fbbf24",
  },
  completed: {
    dotColor: "var(--accent-mint)",
    bgColor: "var(--accent-mint-dim)",
    textColor: "var(--accent-mint)",
  },
  approved: {
    dotColor: "var(--accent-mint)",
    bgColor: "var(--accent-mint-dim)",
    textColor: "var(--accent-mint)",
  },
  rejected: {
    dotColor: "#f43f5e",
    bgColor: "rgba(244,63,94,0.15)",
    textColor: "#fb7185",
  },
  failed: {
    dotColor: "#f43f5e",
    bgColor: "rgba(244,63,94,0.15)",
    textColor: "#fb7185",
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
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] leading-tight",
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
