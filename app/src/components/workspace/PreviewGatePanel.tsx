"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { CheckCircle2, Coins, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";

interface PreviewDerivation {
  id: string;
  name: string;
  imageUrl?: string;
  status: string;
  qualityScore?: number;
  qualityVerdict?: string;
  creditCost?: number;
}

interface PreviewGatePanelProps {
  campaignId: string;
  preview: PreviewDerivation;
  previewCreditsSpent: number;
  batchCredits: number;
  isApproving?: boolean;
  className?: string;
  onReviseRecipe: () => void;
  onApproveBatch: () => void;
}

export default function PreviewGatePanel({
  campaignId,
  preview,
  previewCreditsSpent,
  batchCredits,
  isApproving,
  className,
  onReviseRecipe,
  onApproveBatch,
}: PreviewGatePanelProps) {
  const t = useTranslations("strategyRecipes.previewGate");
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const isGenerating = preview.status === "generating";

  const STAGE_PROPS = { stage: "preview", missionKey: "preview" } as const;

  useEffect(() => {
    recordEvent("cockpit_stage_entered", STAGE_PROPS);
  }, [recordEvent]);

  const handleApproveBatch = () => {
    recordEvent("cockpit_stage_completed", STAGE_PROPS);
    onApproveBatch();
  };

  const handleReviseRecipe = () => {
    recordEvent("cockpit_stage_abandoned", STAGE_PROPS);
    onReviseRecipe();
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)]/40 p-4 space-y-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--accent-green-text)]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("title")}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)]">
          {preview.imageUrl && !isGenerating ? (
            <Image
              src={preview.imageUrl}
              alt={preview.name}
              fill
              sizes="96px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Sparkles className="size-6 animate-pulse text-[var(--text-muted)]" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-xs text-[var(--text-secondary)]">
          <p className="font-medium text-[var(--text-primary)]">{preview.name}</p>
          {preview.qualityVerdict && (
            <p>{t("qualityVerdict", { verdict: preview.qualityVerdict })}</p>
          )}
          {typeof preview.qualityScore === "number" && (
            <p>{t("qualityScore", { score: preview.qualityScore })}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-base)] px-3 py-2 text-xs">
        <Coins className="size-4 text-[var(--accent-green-text)]" />
        <div className="flex-1">
          <p>{t("previewSpent", { credits: previewCreditsSpent })}</p>
          <p className="font-medium text-[var(--text-primary)]">
            {t("batchCost", { credits: batchCredits })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleReviseRecipe}
          disabled={isApproving}
        >
          <Pencil className="mr-2 size-4" />
          {t("reviseRecipe")}
        </Button>
        <Button
          className="flex-1"
          onClick={handleApproveBatch}
          disabled={isApproving || isGenerating}
        >
          {isApproving ? (
            <Sparkles className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          {t("approveBatch")}
        </Button>
      </div>
    </div>
  );
}
