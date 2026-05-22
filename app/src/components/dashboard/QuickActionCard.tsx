"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";

interface QuickActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBgColor: string;
  iconColor: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  featured?: boolean;
  index: number;
}

export function QuickActionCard({
  icon: Icon,
  title,
  description,
  iconBgColor,
  iconColor,
  href,
  disabled = false,
  onClick,
  featured = false,
  index,
}: QuickActionCardProps) {
  const t = useTranslations("common");
  const content = (
    <div
      className={cn(
        "animate-fade-in group h-full rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 transition-all duration-250 sm:p-5",
        featured && "border-[var(--accent-mint)]/40 bg-[linear-gradient(135deg,rgba(47,182,125,0.1),rgba(255,255,255,0)_48%)]",
        !disabled &&
          "hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      style={{ animationDelay: `${250 + index * 60}ms` }}
      onClick={onClick}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-transform duration-250 group-hover:scale-105"
          style={{ backgroundColor: iconBgColor }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        {!disabled && (
          <ArrowRight
            size={16}
            className="shrink-0 text-[var(--text-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>
      <p className="text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-2">
        {description}
      </p>
    </div>
  );

  if (disabled) {
    return (
      <div title={t("comingSoon")} className={cn("h-full", featured && "sm:col-span-2 lg:col-span-1")}>
        {content}
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("block h-full text-left", featured && "sm:col-span-2 lg:col-span-1")}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} className={cn("block h-full", featured && "sm:col-span-2 lg:col-span-1")}>
      {content}
    </Link>
  );
}
