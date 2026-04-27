"use client";

import { cn } from "@/lib/utils";
interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

const statusConfig: Record<
  string,
  { label: string; dotColor: string; bgColor: string; textColor: string }
> = {
  draft: {
    label: "Draft",
    dotColor: "#475569",
    bgColor: "rgba(71,85,105,0.15)",
    textColor: "#94a3b8",
  },
  active: {
    label: "Active",
    dotColor: "#6366f1",
    bgColor: "rgba(99,102,241,0.15)",
    textColor: "#818cf8",
  },
  generating: {
    label: "Generating",
    dotColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.15)",
    textColor: "#fbbf24",
  },
  completed: {
    label: "Completed",
    dotColor: "#14b8a6",
    bgColor: "rgba(20,184,166,0.15)",
    textColor: "#2dd4bf",
  },
  approved: {
    label: "Approved",
    dotColor: "#10b981",
    bgColor: "rgba(16,185,129,0.15)",
    textColor: "#34d399",
  },
  failed: {
    label: "Failed",
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
  const config = statusConfig[status] ?? {
    label: status,
    dotColor: "#94a3b8",
    bgColor: "rgba(148,163,184,0.15)",
    textColor: "#94a3b8",
  };

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
      {config.label}
    </span>
  );
}
