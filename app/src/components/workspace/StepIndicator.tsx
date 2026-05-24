"use client";

import { Check, FileText, Upload, LayoutGrid, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type StepKey = 1 | 2 | 3 | 4;

interface Step {
  key: StepKey;
  label: string;
  icon: typeof FileText;
}

interface StepIndicatorProps {
  currentStep: StepKey;
  onStepClick?: (step: StepKey) => void;
}

export default function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  const t = useTranslations("steps");

  const steps: Step[] = [
    { key: 1, label: t("brief"), icon: FileText },
    { key: 2, label: t("upload"), icon: Upload },
    { key: 3, label: t("plan"), icon: Sparkles },
    { key: 4, label: t("gallery"), icon: LayoutGrid },
  ];

  return (
    <div className="flex items-center justify-center w-full py-6 px-4">
      <div className="flex items-center gap-0 max-w-[720px] w-full justify-between">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.key;
          const isActive = currentStep === step.key;
          const isPending = currentStep < step.key;
          const isLast = index === steps.length - 1;

          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => {
                    if (isCompleted && onStepClick) {
                      onStepClick(step.key);
                    }
                  }}
                  disabled={!isCompleted || !onStepClick}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={
                    isActive
                      ? t("currentStep", { step: step.label })
                      : isCompleted
                        ? t("completedStep", { step: step.label })
                        : t("lockedStep", { step: step.label })
                  }
                  className={cn(
                    "relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300",
                    isPending && "bg-[var(--surface-base)] border border-[var(--border-dim)] cursor-default",
                    isActive && "border-2 border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] cursor-default",
                    isCompleted && "bg-[var(--accent-teal)] border-none cursor-pointer hover:scale-105",
                    isActive && "shadow-[0_0_12px_rgba(47,182,125,0.2)]"
                  )}
                >
                  <div className="flex items-center justify-center">
                    {isCompleted ? (
                      <Check size={16} className="text-white" strokeWidth={3} />
                    ) : (
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isPending && "text-[var(--text-muted)]",
                          isActive && "text-[var(--accent-mint)]"
                        )}
                      >
                        <Icon size={14} />
                      </span>
                    )}
                  </div>
                </button>

                {/* Label */}
                <span
                  className={cn(
                    "text-xs font-medium transition-colors duration-200",
                    isPending && "text-[var(--text-muted)]",
                    isActive && "text-[var(--accent-mint)]",
                    isCompleted && "text-[var(--accent-teal)]"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 h-0.5 mx-3 mt-[-18px] relative">
                  {/* Background line */}
                  <div className="absolute inset-0 bg-[var(--border-dim)] rounded-full" />
                  {/* Completed fill */}
                  <div
                    className={cn(
                      "absolute inset-0 bg-[var(--accent-teal)] rounded-full origin-left transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      isCompleted ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
