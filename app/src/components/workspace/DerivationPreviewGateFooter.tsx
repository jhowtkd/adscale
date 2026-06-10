"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Coins, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import type { BatchCreditBreakdown } from "@/server/ai/strategy-recipes";

interface DerivationPreviewGateFooterProps {
  campaignId: string;
  previewCreditsSpent: number;
  batchBreakdown: BatchCreditBreakdown;
  creditBalance?: number;
  isApproving?: boolean;
  isGenerating?: boolean;
  className?: string;
  onReviseRecipe: () => void;
  onApproveBatch: () => void;
}

export default function DerivationPreviewGateFooter({
  campaignId,
  previewCreditsSpent,
  batchBreakdown,
  creditBalance,
  isApproving,
  isGenerating,
  className,
  onReviseRecipe,
  onApproveBatch,
}: DerivationPreviewGateFooterProps) {
  const t = useTranslations("strategyRecipes.previewGate");
  const { recordEvent } = useRecordBetaEvent(campaignId);

  const STAGE_PROPS = { stage: "preview", missionKey: "preview" } as const;
  const { jobCount, unitCost, totalCredits, generationMode } = batchBreakdown;

  const insufficient =
    typeof creditBalance === "number" &&
    totalCredits > 0 &&
    creditBalance < totalCredits;

  const approveDisabled =
    isApproving ||
    isGenerating ||
    jobCount === 0 ||
    creditBalance === undefined ||
    insufficient;

  useEffect(() => {
    recordEvent("cockpit_stage_entered", STAGE_PROPS);
  }, [recordEvent]);

  const handleApproveBatch = () => {
    recordEvent("cockpit_stage_completed", STAGE_PROPS);
    onApproveBatch();
  };

  const batchFormulaKey =
    generationMode === "format_adaptation"
      ? "batchFormulaFormat"
      : "batchFormulaCta";

  return (
    <div
      className={cn(
        "mt-3 space-y-3 rounded-lg border border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)]/40 p-3",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--accent-green-text)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--text-primary)]">{t("title")}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{t("description")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-base)] px-3 py-2 text-[11px]">
        <Coins className="size-3.5 text-[var(--accent-green-text)]" />
        <div className="flex-1 space-y-1">
          <p>{t("previewSpent", { credits: previewCreditsSpent })}</p>
          <p className="text-[var(--text-secondary)]">
            {typeof creditBalance === "number"
              ? t("balanceRemaining", { balance: creditBalance })
              : t("balanceLoading")}
          </p>
          {jobCount > 0 ? (
            <p className="font-medium text-[var(--text-primary)]">
              {t(batchFormulaKey, {
                count: jobCount,
                unit: unitCost,
                total: totalCredits,
              })}
            </p>
          ) : (
            <p className="font-medium text-[var(--text-primary)]">{t("batchCostPending")}</p>
          )}
          {insufficient ? (
            <p className="text-[var(--destructive)]">
              {t("insufficientCredits", {
                estimate: totalCredits,
                balance: creditBalance,
              })}
            </p>
          ) : null}
          <p className="text-[var(--text-muted)]">{t("creditEstimateNote")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onReviseRecipe}
          disabled={isApproving}
        >
          <Pencil className="mr-1.5 size-3.5" />
          {t("reviseRecipe")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          onClick={handleApproveBatch}
          disabled={approveDisabled}
        >
          {isApproving ? (
            <Sparkles className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 size-3.5" />
          )}
          {t("approveBatch")}
        </Button>
      </div>
    </div>
  );
}
