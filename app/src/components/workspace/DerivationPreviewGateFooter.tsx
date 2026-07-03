"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";

interface DerivationPreviewGateFooterProps {
  campaignId: string;
  isApproving?: boolean;
  isGenerating?: boolean;
  className?: string;
  onApproveBatch: () => void;
}

export default function DerivationPreviewGateFooter({
  campaignId,
  isApproving,
  isGenerating,
  className,
  onApproveBatch,
}: DerivationPreviewGateFooterProps) {
  const t = useTranslations("strategyRecipes.previewGate");
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const completedRef = useRef(false);

  const STAGE_PROPS = { stage: "preview", missionKey: "preview" } as const;

  const approveDisabled = isApproving || isGenerating;

  useEffect(() => {
    completedRef.current = false;
    recordEvent("cockpit_stage_entered", STAGE_PROPS);
    return () => {
      if (!completedRef.current) {
        recordEvent("cockpit_stage_abandoned", STAGE_PROPS);
      }
    };
  }, [recordEvent]);

  const handleApproveBatch = () => {
    completedRef.current = true;
    recordEvent("cockpit_stage_completed", STAGE_PROPS);
    onApproveBatch();
  };

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

      <Button
        type="button"
        size="sm"
        className="h-auto w-full whitespace-normal px-3 py-2 text-center leading-snug"
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
  );
}
