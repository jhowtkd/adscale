"use client";


import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: {
    value: string;
    positive?: boolean;
  };
  iconBgColor: string;
  iconColor: string;
  index?: number;
  className?: string;
}

function StatsCard({
  icon: Icon,
  label,
  value,
  change,
  iconBgColor,
  iconColor,
  index = 0,
  className,
}: StatsCardProps) {
  const t = useTranslations("common");

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 transition-all duration-250 cursor-pointer will-change-transform",
        "hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5",
        "animate-fade-in",
        className
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Hover flat overlay */}
      <div className="absolute inset-0 rounded-xl border border-[var(--accent-green)]/0 transition-all duration-250 group-hover:border-[var(--accent-green)]/30" />

      <div className="relative z-10">
        {/* Icon */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md mb-3"
          style={{ backgroundColor: iconBgColor }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>

        {/* Label */}
        <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] mb-1 font-mono">
          {label}
        </p>

        {/* Value */}
        <p className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)] mb-1 font-mono">
          {value}
        </p>

        {/* Change indicator */}
        {change && (
          <div className="flex items-center gap-1 text-[13px]">
            <span
              className={cn(
                change.positive !== false
                  ? "text-[var(--accent-teal)]"
                  : "text-[var(--accent-amber)]"
              )}
            >
              {change.positive !== false ? "▲" : "▼"} {change.value}
            </span>
            {change.positive !== undefined && (
              <span className="text-[var(--text-muted)] text-xs">{t("vsLastMonth")}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(StatsCard);
