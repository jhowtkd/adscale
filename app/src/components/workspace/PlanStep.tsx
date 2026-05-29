"use client";

import { useEffect } from "react";
import { Sparkles, ArrowRight, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePlan, useGeneratePlan, useUpdatePlanStatus } from "@/lib/hooks/use-plan";
import type { CampaignStatus } from "@/lib/mock-data";
import CreativePlanCard from "./CreativePlanCard";

interface PlanStepProps {
  campaignId: string;
  onApproveAndGenerate: () => void;
  onSkipPlan: () => void;
  onBack: () => void;
}

export default function PlanStep({
  campaignId,
  onApproveAndGenerate,
  onSkipPlan,
  onBack,
}: PlanStepProps) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const ts = useTranslations("campaign");

  const { data: plan, isLoading: isPlanLoading } = usePlan(campaignId);
  const generatePlan = useGeneratePlan(campaignId);
  const updatePlanStatus = useUpdatePlanStatus(campaignId);

  // Auto-generate plan on mount if none exists
  useEffect(() => {
    if (!plan && !isPlanLoading && !generatePlan.isPending && !generatePlan.isError) {
      generatePlan.mutate();
    }
  }, [plan, isPlanLoading, generatePlan]);

  const handleApprove = () => {
    if (!plan) return;
    updatePlanStatus.mutate("approved", {
      onSuccess: onApproveAndGenerate,
    });
  };

  const handleRegenerate = () => {
    generatePlan.mutate();
  };

  // Loading state
  if (generatePlan.isPending || isPlanLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] glass-card rounded-xl">
        <div className="mb-4">
          <div className="relative">
            <Sparkles size={40} className="text-[var(--accent-green)]" />
            <div
              className="absolute inset-0 rounded-full border-2 border-[var(--accent-green)] border-t-transparent animate-spin"
              style={{ width: 56, height: 56, top: -8, left: -8 }}
            />
          </div>
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">
          {ts("generatingPlan")}
        </h3>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (generatePlan.isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] glass-card rounded-xl">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {tc("errorLoading")}
        </p>
        <button
          onClick={handleRegenerate}
          className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] transition-colors"
        >
          <Sparkles size={16} />
          {tc("tryAgain")}
        </button>
      </div>
    );
  }

  // No plan state
  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] glass-card rounded-xl">
        <p className="text-sm text-[var(--text-muted)]">{t("noPlan")}</p>
      </div>
    );
  }

  const isApproved = plan.status === "approved";

  return (
    <div className="max-w-[960px] mx-auto">
      {/* Skip button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={onSkipPlan}
          disabled={updatePlanStatus.isPending}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <SkipForward size={14} />
          {ts("skipPlan")}
        </button>
      </div>

      <CreativePlanCard
        plan={{
          id: plan.id,
          campaignId: plan.campaignId,
          strategy: plan.strategy ?? "",
          angles: Array.isArray(plan.angles)
            ? plan.angles.map((a, i) =>
                typeof a === "string"
                  ? { number: i + 1, title: `Ângulo ${i + 1}`, description: a }
                  : a
              )
            : [],
          hooks: plan.hooks ?? [],
          ctas: plan.ctas ?? [],
          status: plan.status as CampaignStatus,
          createdAt: plan.createdAt,
        }}
        onApprove={handleApprove}
        onEdit={() => {}}
        onRegenerate={handleRegenerate}
        approved={isApproved}
      />

      {/* Generate Derivations button - shown when approved */}
      {isApproved && (
        <div className="mt-6 flex justify-center animate-fade-in">
          <button
            onClick={onApproveAndGenerate}
            disabled={updatePlanStatus.isPending}
            className="inline-flex items-center gap-2 rounded-md px-8 py-3 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] hover:-translate-y-px active:scale-[0.98] shadow-lg shadow-[rgba(99,102,241,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRight size={16} />
            {ts("generateDerivations")}
          </button>
        </div>
      )}

      {/* Back button */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={onBack}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {ts("backToUpload")}
        </button>
      </div>
    </div>
  );
}
