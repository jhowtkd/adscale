"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type ResponsiveTabItem = {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export default function ResponsiveTabs({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className,
}: {
  items: ResponsiveTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[var(--border-dim)]", className)}>
      <nav
        aria-label={ariaLabel}
        className="-mb-px flex gap-1 overflow-x-auto pb-px [scrollbar-width:thin]"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          const disabled = item.disabled === true;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!disabled) onSelect(item.id);
              }}
              disabled={disabled}
              aria-pressed={active}
              aria-disabled={disabled || undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                disabled
                  ? "cursor-not-allowed opacity-50 text-[var(--text-muted)]"
                  : active
                    ? "text-[var(--selection-text)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span className="flex items-center gap-2">
                {item.label}
                {item.badge}
              </span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--selection-border)]"
                />
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
