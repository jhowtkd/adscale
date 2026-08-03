"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface FullBriefingForm {
  product: string;
  offer: string;
  objective: string;
  audience: string;
  tone: string;
  platforms: string;
  ctaText: string;
  constraints: string;
}

interface GuidedBriefingPanelProps {
  campaignId: string;
  initialAnswers?: GuidedBriefingAnswers;
  hints?: GuidedBriefingHints;
  onComplete: (briefing: ReturnType<typeof mapGuidedAnswersToPilotBriefing> & { tone?: string }) => void;
  className?: string;
}

function stepIndex(stepId: string | null): number {
  if (!stepId) return GUIDED_BRIEFING_STEP_ORDER.length;
  return GUIDED_BRIEFING_STEP_ORDER.indexOf(
    stepId as (typeof GUIDED_BRIEFING_STEP_ORDER)[number]
  );
}

function fullFormFromAnswers(
  answers: GuidedBriefingAnswers,
  hints?: GuidedBriefingHints
): FullBriefingForm {
  const mapped = mapGuidedAnswersToPilotBriefing(answers);
  return {
    product: mapped.product ?? "",
    offer: mapped.offer ?? "",
    objective: mapped.objective ?? "",
    audience: mapped.audience ?? "",
    tone: hints?.suggestedTone ?? "",
    platforms: mapped.platforms ?? "",
    ctaText: mapped.ctaText ?? "",
    constraints: mapped.constraints ?? "",
  };
}

function answersFromFullForm(form: FullBriefingForm): GuidedBriefingAnswers {
  return {
    product: form.product || undefined,
    offer: form.offer || undefined,
    audience: form.audience || undefined,
    promise: form.objective || undefined,
    cta: form.ctaText || undefined,
    platforms: form.platforms || undefined,
    constraints: form.constraints || undefined,
  };
}

function FullFieldsDisclosure({
  initialForm,
  onSaveAll,
  isSaving,
}: {
  initialForm: FullBriefingForm;
  onSaveAll: (form: FullBriefingForm) => void;
  isSaving?: boolean;
}) {
  const t = useTranslations("guidedBriefing");
  const [form, setForm] = useState(initialForm);

  return (
    <details className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline [&::-webkit-details-marker]:hidden">
        {t("editAllFields")}
      </summary>
      <div className="space-y-3 border-t border-[var(--border-dim)] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              {t("fields.product")}
            </label>
            <Input
              value={form.product}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, product: e.target.value }))
              }
              placeholder={t("fields.productPlaceholder")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              {t("fields.offer")}
            </label>
            <Input
              value={form.offer}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, offer: e.target.value }))
              }
              placeholder={t("fields.offerPlaceholder")}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {t("fields.objective")}
          </label>
          <Input
            value={form.objective}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, objective: e.target.value }))
            }
            placeholder={t("steps.promise.placeholder")}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {t("fields.audience")}
          </label>
          <Input
            value={form.audience}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, audience: e.target.value }))
            }
            placeholder={t("steps.audience.placeholder")}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {t("fields.tone")}
          </label>
          <Input
            value={form.tone}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tone: e.target.value }))
            }
            placeholder={t("fields.tonePlaceholder")}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {t("fields.platforms")}
          </label>
          <Input
            value={form.platforms}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, platforms: e.target.value }))
            }
            placeholder={t("steps.platforms.placeholder")}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {t("fields.cta")}
          </label>
          <Input
            value={form.ctaText}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, ctaText: e.target.value }))
            }
            placeholder={t("steps.cta.placeholder")}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {t("fields.constraints")}
          </label>
          <Textarea
            value={form.constraints}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, constraints: e.target.value }))
            }
            rows={3}
            placeholder={t("steps.constraints.placeholder")}
          />
        </div>
        <Button size="sm" disabled={isSaving} onClick={() => onSaveAll(form)}>
          {t("saveAllFields")}
        </Button>
      </div>
    </details>
  );
}

export default function GuidedBriefingPanel({
  campaignId,
  initialAnswers,
  hints,
  onComplete,
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
    briefing: ReturnType<typeof mapGuidedAnswersToPilotBriefing> & { tone?: string }
  ) => {
    completedRef.current = true;
    recordEvent("cockpit_stage_completed", STAGE_PROPS);
    onComplete(briefing);
  };

  const progress = useMemo(() => {
    const current = stepIndex(guided.currentStep);
    return { current: current + 1, total: GUIDED_BRIEFING_STEP_ORDER.length };
  }, [guided.currentStep]);

  const handleAccept = async () => {
    const nextAnswers = await guided.acceptSuggestion();
    if (getNextStep(nextAnswers) === null) {
      finishBriefing({
        ...mapGuidedAnswersToPilotBriefing(nextAnswers),
        tone: hints?.suggestedTone,
      });
    }
  };

  const handleSaveEdit = async () => {
    const nextAnswers = await guided.acceptEditedValue();
    if (getNextStep(nextAnswers) === null) {
      finishBriefing({
        ...mapGuidedAnswersToPilotBriefing(nextAnswers),
        tone: hints?.suggestedTone,
      });
    }
  };

  const handleSkip = async () => {
    const nextAnswers = await guided.skipStep();
    if (getNextStep(nextAnswers) === null) {
      finishBriefing({
        ...mapGuidedAnswersToPilotBriefing(nextAnswers),
        tone: hints?.suggestedTone,
      });
    }
  };

  const fullFieldsBlock = (
    <FullFieldsDisclosure
      key={JSON.stringify(guided.answers)}
      initialForm={fullFormFromAnswers(guided.answers, hints)}
      onSaveAll={(form) => {
        const answers = answersFromFullForm(form);
        finishBriefing({
          ...mapGuidedAnswersToPilotBriefing(answers),
          tone: form.tone || hints?.suggestedTone,
        });
      }}
      isSaving={guided.isPersisting}
    />
  );

  if (guided.isComplete) {
    return (
      <div className={cn("space-y-4", className)}>
        <p className="text-sm text-[var(--text-secondary)]">{t("complete")}</p>
        {fullFieldsBlock}
        <Button
          className="w-full"
          onClick={() =>
            finishBriefing({
              ...mapGuidedAnswersToPilotBriefing(guided.answers),
              tone: hints?.suggestedTone,
            })
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
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
          {t("progress", { current: progress.current, total: progress.total })}
        </p>
        <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
          {t(`steps.${stepId}.title`)}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t(`steps.${stepId}.description`)}
        </p>
      </div>

      {!guided.isEditing ? (
        <div className="space-y-3 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--warning-text)]">
            <Lightbulb size={14} />
            <span>{t("suggested")}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
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
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  {t("fields.product")}
                </label>
                <Input
                  value={guided.productEditValue}
                  onChange={(e) => guided.setProductEditValue(e.target.value)}
                  placeholder={t("fields.productPlaceholder")}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
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

      {fullFieldsBlock}
    </div>
  );
}
