"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import {
  recommendationDismissStorageKey,
  useNextExperimentRecommendation,
  type NextExperimentPrefill,
} from "@/lib/hooks/use-next-experiment-recommendation";

export interface RecipePrefillPayload {
  recipeId: NextExperimentPrefill["recipeId"];
  config: Omit<NextExperimentPrefill, "recipeId">;
}

interface NextExperimentRecommendationCardProps {
  campaignId: string;
  onAccept: (prefill: RecipePrefillPayload) => void;
  onEdit: (prefill: RecipePrefillPayload) => void;
}

function toRecipePrefill(prefill: NextExperimentPrefill): RecipePrefillPayload {
  const { recipeId, ...config } = prefill;
  return { recipeId, config };
}

function titleKeyForVariable(variableKey: string): "cta" | "format" | "recipe" | "style" {
  if (variableKey === "cta" || variableKey === "format" || variableKey === "recipe") {
    return variableKey;
  }
  return "style";
}

export default function NextExperimentRecommendationCard({
  campaignId,
  onAccept,
  onEdit,
}: NextExperimentRecommendationCardProps) {
  const t = useTranslations("campaigns.nextExperiment");
  const tConfidence = useTranslations("campaigns.learnings.confidence");
  const locale = useLocale();
  const { data, isLoading, isError } = useNextExperimentRecommendation(campaignId);
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const viewedRef = useRef(false);
  const [dismissedLocally, setDismissedLocally] = useState(false);

  const recommendation = data?.recommendation ?? null;
  const dismissKey = recommendation
    ? recommendationDismissStorageKey(campaignId, recommendation.id)
    : null;
  const dismissedFromStorage =
    typeof window !== "undefined" &&
    dismissKey !== null &&
    sessionStorage.getItem(dismissKey) === "1";
  const dismissed = dismissedFromStorage || dismissedLocally;

  useEffect(() => {
    if (!recommendation || viewedRef.current || dismissed) return;

    viewedRef.current = true;
    recordEvent("next_experiment_viewed", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      learningCount: recommendation.evidence.length,
      source: recommendation.learningsSource,
    });
  }, [campaignId, dismissed, recommendation, recordEvent]);

  if (isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (isError || data?.status !== "ready" || !recommendation || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem(
      recommendationDismissStorageKey(campaignId, recommendation.id),
      "1",
    );
    recordEvent("next_experiment_dismissed", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      reasonCode: "user_dismissed",
    });
    setDismissedLocally(true);
  };

  const handleAccept = () => {
    const prefill = toRecipePrefill(recommendation.prefill);
    recordEvent("next_experiment_accepted", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      recipeId: prefill.recipeId,
      action: "accept",
    });
    onAccept(prefill);
  };

  const handleEdit = () => {
    const prefill = toRecipePrefill(recommendation.prefill);
    recordEvent("next_experiment_edited", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      recipeId: prefill.recipeId,
      action: "edit",
    });
    onEdit(prefill);
  };

  const titleKey = titleKeyForVariable(recommendation.primaryVariableKey);

  return (
    <article className="rounded-lg border border-[var(--accent-green)]/30 bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-green-text)]">
            {t("eyebrow")}
          </p>
          <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">
            {t(`titles.${titleKey}`, { value: recommendation.primaryVariableValue })}
          </h3>
        </div>
        <span className="rounded bg-[var(--surface-base)] px-2 py-0.5 text-xs">
          {t("confidence", { level: tConfidence(recommendation.confidence) })}
        </span>
      </header>

      <p className="mt-3 text-sm text-[var(--text-primary)]">{recommendation.justification}</p>

      <dl className="mt-4 grid gap-3 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
        <div>
          <dt className="font-medium text-[var(--text-primary)]">{t("sample")}</dt>
          <dd>
            {t("sampleValue", {
              impressions: recommendation.sampleImpressions.toLocaleString(locale),
              campaigns: recommendation.sampleCampaignCount,
            })}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">{t("evidence")}</dt>
          <dd>
            {t("evidenceValue", {
              count: recommendation.evidence.length,
              score: recommendation.confidenceScore,
            })}
          </dd>
        </div>
      </dl>

      {recommendation.evidence.length > 0 ? (
        <ul className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
          {recommendation.evidence.map((item) => (
            <li
              key={item.learningId}
              className="rounded border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2"
            >
              {item.statement}
            </li>
          ))}
        </ul>
      ) : null}

      {recommendation.contradictions.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--warning-text)]">
          {t("contradictions", { count: recommendation.contradictions.length })}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleAccept}>
          {t("accept")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleEdit}>
          {t("edit")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleDismiss}>
          {t("dismiss")}
        </Button>
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-secondary)]">{t("disclaimer")}</p>
    </article>
  );
}
