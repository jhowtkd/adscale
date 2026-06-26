"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GuidedBriefingAnswers } from "@/server/ai/guided-briefing";
import { useSaveFromZeroBrief } from "@/lib/hooks/use-from-zero-path";

export interface FromZeroBriefPanelProps {
  threadId: string;
}

const EMPTY_ANSWERS: GuidedBriefingAnswers = {
  product: "",
  offer: "",
  audience: "",
  promise: "",
  objections: "",
  cta: "",
  platforms: "",
  constraints: "",
};

export default function FromZeroBriefPanel({ threadId }: FromZeroBriefPanelProps) {
  const t = useTranslations("assistant.guidedFlow.fromZero");
  const [answers, setAnswers] = useState<GuidedBriefingAnswers>(EMPTY_ANSWERS);
  const [error, setError] = useState<string | null>(null);
  const saveBrief = useSaveFromZeroBrief(threadId);

  const update = (key: keyof GuidedBriefingAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      await saveBrief.mutateAsync(answers);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  return (
    <div
      className="mx-4 mt-2 space-y-3 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="from-zero-brief-panel"
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">{t("briefTitle")}</p>
      <p className="text-xs text-[var(--text-muted)]">{t("briefSubtitle")}</p>

      <Input
        value={answers.product ?? ""}
        onChange={(e) => update("product", e.target.value)}
        placeholder={t("productPlaceholder")}
        aria-label={t("productPlaceholder")}
      />
      <Input
        value={answers.offer ?? ""}
        onChange={(e) => update("offer", e.target.value)}
        placeholder={t("offerPlaceholder")}
        aria-label={t("offerPlaceholder")}
      />
      <Input
        value={answers.audience ?? ""}
        onChange={(e) => update("audience", e.target.value)}
        placeholder={t("audiencePlaceholder")}
        aria-label={t("audiencePlaceholder")}
      />
      <Input
        value={answers.promise ?? ""}
        onChange={(e) => update("promise", e.target.value)}
        placeholder={t("promisePlaceholder")}
        aria-label={t("promisePlaceholder")}
      />
      <Input
        value={answers.objections ?? ""}
        onChange={(e) => update("objections", e.target.value)}
        placeholder={t("objectionsPlaceholder")}
        aria-label={t("objectionsPlaceholder")}
      />
      <Input
        value={answers.cta ?? ""}
        onChange={(e) => update("cta", e.target.value)}
        placeholder={t("ctaPlaceholder")}
        aria-label={t("ctaPlaceholder")}
      />
      <Input
        value={answers.platforms ?? ""}
        onChange={(e) => update("platforms", e.target.value)}
        placeholder={t("platformsPlaceholder")}
        aria-label={t("platformsPlaceholder")}
      />
      <Textarea
        value={answers.constraints ?? ""}
        onChange={(e) => update("constraints", e.target.value)}
        placeholder={t("constraintsPlaceholder")}
        aria-label={t("constraintsPlaceholder")}
        rows={2}
      />

      {error ? (
        <p className="text-xs text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={saveBrief.isPending}
        onClick={() => void handleSubmit()}
        data-testid="from-zero-save-brief"
      >
        {t("saveBrief")}
      </Button>
    </div>
  );
}
