"use client";

import Link from "next/link";
import { type LucideIcon, ChevronRight } from "lucide-react";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  steps?: string[];
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  steps,
}: EmptyStateProps) {
  const actionContent = action ? (
    action.href ? (
      <Link
        href={action.href}
        className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] active:scale-[0.98]"
      >
        {action.label}
      </Link>
    ) : (
      <button
        onClick={action.onClick}
        className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] active:scale-[0.98]"
      >
        {action.label}
      </button>
    )
  ) : null;

  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 animate-fade-in">
      <div className="flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className="mb-4">
          <Icon size={48} className="text-[var(--text-muted)]" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {description}
        </p>

        {/* Steps */}
        {steps && steps.length > 0 && (
          <div className="flex items-center justify-center flex-wrap gap-2 mb-6">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-mint-dim)] text-[var(--accent-mint)] text-[10px] font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight size={14} className="text-[var(--border-medium)]" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        {actionContent}
      </div>
    </div>
  );
}
