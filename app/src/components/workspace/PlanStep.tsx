"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import CreativePlanCard from "./CreativePlanCard";
import type { CreativePlan } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface PlanStepProps {
  plan: CreativePlan | null;
  onApprove: () => void;
  onGenerateDerivations: () => void;
  approved: boolean;
  isGenerating?: boolean;
}

// ============================================
// Loading Dots Component
// ============================================

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-[var(--accent-mint)] animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

// ============================================
// Component
// ============================================

export default function PlanStep({ plan, onApprove, onGenerateDerivations, approved, isGenerating }: PlanStepProps) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const [isLoading, setIsLoading] = useState(!plan);
  const [isEditing, setIsEditing] = useState(false);

  // Simulate loading if no plan yet
  if (isLoading && !plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)] animate-fade-in">
        <div className="mb-4">
          <div className="relative">
            <Sparkles size={40} className="text-[var(--accent-mint)]" />
            <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-mint)] border-t-transparent animate-spin" 
              style={{ width: 56, height: 56, top: -8, left: -8 }}
            />
          </div>
        </div>

        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">
          {t("generating")}
        </h3>

        <LoadingDots />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)]">
        <p className="text-sm text-[var(--text-muted)]">{t("noPlan")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto">
      <CreativePlanCard
        plan={plan}
        onApprove={onApprove}
        onEdit={() => setIsEditing(!isEditing)}
        onRegenerate={() => setIsLoading(true)}
        approved={approved}
        isEditing={isEditing}
      />

      {/* Generate Derivations button - shown when approved */}
      {approved && (
        <div className="mt-6 flex justify-center animate-fade-in">
          <button
            onClick={onGenerateDerivations}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-md px-8 py-3 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] hover:-translate-y-px active:scale-[0.98] shadow-lg shadow-[rgba(99,102,241,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            {isGenerating ? tc("loading") : t("generateDerivations")}
          </button>
        </div>
      )}
    </div>
  );
}
