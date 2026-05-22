"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  steps?: string[];
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  steps,
  className,
}: EmptyStateProps) {
  const buttonClasses =
    "inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]";

  return (
    <div
      className={cn(
        "animate-fade-in flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="max-w-md w-full flex flex-col items-center">
        {/* Icon */}
        <div className="mb-5">
          <Icon
            size={48}
            className="text-[var(--text-muted)]"
            strokeWidth={1.5}
          />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          {description}
        </p>

        {/* Action */}
        {action &&
          (action.href ? (
            <Link href={action.href} className={buttonClasses}>
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className={buttonClasses}>
              {action.label}
            </button>
          ))}

        {/* Steps */}
        {steps && steps.length > 0 && (
          <div className="mt-6 flex items-center gap-2 flex-wrap justify-center">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--surface-raised)] text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-dim)]">
                  {index + 1}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {step}
                </span>
                {index < steps.length - 1 && (
                  <ChevronRight
                    size={14}
                    className="text-[var(--text-muted)]"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
