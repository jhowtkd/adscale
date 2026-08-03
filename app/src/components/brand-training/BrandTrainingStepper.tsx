"use client";

import { Check } from "lucide-react";
import { m } from "@/components/animations/MotionBoundary";
import { cn } from "@/lib/utils";

export interface BrandTrainingStep {
  id: string;
  labelKey: string;
}

export function BrandTrainingStepper({
  steps,
  currentIndex,
}: {
  steps: BrandTrainingStep[];
  currentIndex: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <m.li
            key={step.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                isComplete &&
                  "bg-[var(--success-bg)] text-[var(--success-text)]",
                isCurrent &&
                  "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)] ring-2 ring-[var(--focus-ring)]",
                !isComplete &&
                  !isCurrent &&
                  "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)]",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isComplete ? <Check size={14} /> : index + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                isCurrent
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)]",
              )}
            >
              {step.labelKey}
            </span>
            {index < steps.length - 1 && (
              <span
                className={cn(
                  "ml-1 h-px w-6 sm:w-10",
                  isComplete
                    ? "bg-[var(--success-border)]"
                    : "bg-[var(--border-dim)]",
                )}
              />
            )}
          </m.li>
        );
      })}
    </ol>
  );
}
