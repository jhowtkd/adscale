"use client";

import { Download } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { Derivation } from "@/lib/mock-data";

type WizardStep = 1 | 2 | 3 | 4;

interface WizardNavigationFooterProps {
  currentStep: WizardStep;
  approvedDerivation?: Derivation;
  exportMutationPending: boolean;
  createDerivationsPending: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExport: (id: string, format: string) => void;
  getStepNavLabel: (step: WizardStep, direction: "prev" | "next") => string;
}

export default function WizardNavigationFooter({
  currentStep,
  approvedDerivation,
  exportMutationPending,
  createDerivationsPending,
  onPrev,
  onNext,
  onExport,
  getStepNavLabel,
}: WizardNavigationFooterProps) {
  const tc = useTranslations("common");

  if (currentStep === 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 max-w-[960px] mx-auto px-4"
    >
      <button
        onClick={onPrev}
        className={cn(
          "inline-flex min-h-10 w-full items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 sm:w-auto",
          "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
        )}
      >
        {currentStep > 1 ? getStepNavLabel(currentStep, "prev") : ""}
      </button>

      {currentStep === 4 && approvedDerivation ? (
        <button
          onClick={() => onExport(approvedDerivation.id, "png")}
          disabled={exportMutationPending}
          className={cn(
            "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold transition-all duration-200 shadow-sm sm:w-auto",
            exportMutationPending
              ? "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-default"
              : "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
          )}
        >
          <Download size={14} />
          {exportMutationPending ? tc("loading") : "Baixar arte aprovada"}
        </button>
      ) : (
        <button
          onClick={currentStep === 2 ? onNext : onNext}
          disabled={currentStep === 2 || currentStep === 3 || currentStep === 4 || createDerivationsPending}
          className={cn(
            "inline-flex min-h-10 w-full items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium transition-all duration-200 sm:w-auto",
            currentStep === 2 || currentStep === 3 || currentStep === 4 || createDerivationsPending
              ? "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-default"
              : "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
          )}
        >
          {createDerivationsPending ? tc("loading") : getStepNavLabel(currentStep, "next")}
        </button>
      )}
    </motion.div>
  );
}
