"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Check, Lightbulb, Loader2, SkipForward, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useGuidedBriefing } from "@/lib/hooks/use-guided-briefing";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import {
  GUIDED_BRIEFING_STEP_ORDER,
  type GuidedBriefingAnswers,
  type GuidedBriefingHints,
  getNextStep,
  mapGuidedAnswersToPilotBriefing,
} from "@/server/ai/guided-briefing";

interface GuidedBriefingPanelProps {
  campaignId: string;
  initialAnswers?: GuidedBriefingAnswers;
  hints?: GuidedBriefingHints;
  onComplete: (briefing: ReturnType<typeof mapGuidedAnswersToPilotBriefing>) => void;
  onOpenFullForm: () => void;
  className?: string;
}

function stepIndex(stepId: string | null): number {
  if (!stepId) return GUIDED_BRIEFING_STEP_ORDER.length;
  return GUIDED_BRIEFING_STEP_ORDER.indexOf(
    stepId as (typeof GUIDED_BRIEFING_STEP_ORDER)[number]
  );
}

export default function GuidedBriefingPanel({
  campaignId,
  initialAnswers,
  hints,
  onComplete,
  onOpenFullForm,
  className,
}: GuidedBriefingPanelProps) {
  const t = useTranslations("guidedBriefing");
  const tc = useTranslations("common");
  const guided = useGuidedBriefing({ campaignId, initialAnswers, hints });
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const completedRef = useRef(false);

  const STAGE_PROPS = { stage: "guided_briefing", missionKey: "guided_briefing" } as const;

  const abandonProps = () => ({
    ...STAGE_PROPS,
    stepId: guided.currentStep ?? "unknown",
  });

  useEffect(() => {
    recordEvent("cockpit_stage_entered", STAGE_PROPS);
    return () => {
      if (!completedRef.current) {
        recordEvent("cockpit_stage_abandoned", abandonProps());
      }
    };
  }, [recordEvent, guided.currentStep]);

  const finishBriefing = (
    briefing: ReturnType<typeof mapGuidedAnswersToPilotBriefing>
  ) => {
    completedRef.current = true;
    recordEvent("cockpit_stage_completed", STAGE_PROPS);
    onComplete(briefing);
  };

  const handleOpenFullForm = () => {
    recordEvent("cockpit_stage_abandoned", abandonProps());
    onOpenFullForm();
  };

  const progress = useMemo(() => {
    const current = stepIndex(guided.currentStep);
    return { current: current + 1, total: GUIDED_BRIEFING_STEP_ORDER.length };
  }, [guided.currentStep]);

  const handleAccept = async () => {
    const nextAnswers = await guided.acceptSuggestion();
    if (getNextStep(nextAnswers) === null) {
      finishBriefing(mapGuidedAnswersToPilotBriefing(nextAnswers));
    }
  };

  const handleSaveEdit = async () => {
    const nextAnswers = await guided.acceptEditedValue();
    if (getNextStep(nextAnswers) === null) {
      finishBriefing(mapGuidedAnswersToPilotBriefing(nextAnswers));
    }
  };

  const handleSkip = async () => {
    const nextAnswers = await guided.skipStep();
    if (getNextStep(nextAnswers) === null) {
      finishBriefing(mapGuidedAnswersToPilotBriefing(nextAnswers));
    }
  };

  if (guided.isComplete) {
    return (
      <div className={cn("space-y-4", className)}>
        <p className="text-sm text-[var(--text-secondary)]">{t("complete")}</p>
        <Button
          className="w-full"
          onClick={() =>
            finishBriefing(mapGuidedAnswersToPilotBriefing(guided.answers))
          }
        >
          {t("continue")}
        </Button>
      </div>
    );
  }

  const stepId = guided.currentStep;
  if (!stepId) return null;

  const isMultiline =
    stepId === "objections" || stepId === "constraints" || stepId === "promise";

  return (
    <div className={cn("w-full max-w-[640px] space-y-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
            {t("progress", { current: progress.current, total: progress.total })}
          </p>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-1">
            {t(`steps.${stepId}.title`)}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t(`steps.${stepId}.description`)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenFullForm}
          className="text-xs text-[var(--accent-blue)] hover:underline whitespace-nowrap"
        >
          {t("editAllFields")}
        </button>
      </div>

      {!guided.isEditing ? (
        <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--accent-amber)]">
            <Lightbulb size={14} />
            <span>{t("suggested")}</span>
          </div>
          <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
            {guided.suggestion}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={guided.isPersisting}
              onClick={() => void handleAccept()}
            >
              {guided.isPersisting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {t("accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={guided.startEditing}
            >
              <Pencil size={14} />
              {t("edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => void handleSkip()}
            >
              <SkipForward size={14} />
              {t("skip")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {stepId === "productOffer" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  {t("fields.product")}
                </label>
                <Input
                  value={guided.productEditValue}
                  onChange={(e) => guided.setProductEditValue(e.target.value)}
                  placeholder={t("fields.productPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  {t("fields.offer")}
                </label>
                <Input
                  value={guided.offerEditValue}
                  onChange={(e) => guided.setOfferEditValue(e.target.value)}
                  placeholder={t("fields.offerPlaceholder")}
                />
              </div>
            </>
          ) : isMultiline ? (
            <Textarea
              value={guided.editValue}
              onChange={(e) => guided.setEditValue(e.target.value)}
              rows={4}
              placeholder={t(`steps.${stepId}.placeholder`)}
            />
          ) : (
            <Input
              value={guided.editValue}
              onChange={(e) => guided.setEditValue(e.target.value)}
              placeholder={t(`steps.${stepId}.placeholder`)}
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={guided.isPersisting}
              onClick={() => void handleSaveEdit()}
            >
              {tc("save")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => guided.setIsEditing(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
