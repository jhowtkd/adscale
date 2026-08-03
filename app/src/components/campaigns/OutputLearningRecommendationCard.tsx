"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import {
  outputRecommendationDismissStorageKey,
  useOutputLearningRecommendation,
  type OutputGenerationPrefill,
} from "@/lib/hooks/use-output-learning-recommendation";
import { buildApplicationSnapshotFromAccept } from "@/server/human-quality/application-schema";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";

export interface RecipePrefillPayload {
  recipeId: OutputGenerationPrefill["recipeId"];
  config: Omit<OutputGenerationPrefill, "recipeId">;
}

export interface OutputLearningAcceptPayload {
  prefill: RecipePrefillPayload;
  applicationSnapshot: OutputLearningApplicationSnapshot;
}

interface OutputLearningRecommendationCardProps {
  campaignId: string;
  onAccept: (payload: OutputLearningAcceptPayload) => void;
  onEdit: (prefill: RecipePrefillPayload) => void;
}

function toRecipePrefill(prefill: OutputGenerationPrefill): RecipePrefillPayload {
  const { recipeId, ...config } = prefill;
  return { recipeId, config };
}

function titleKeyForVariable(
  variableKey: string,
): "cta" | "format" | "generationMode" | "stylePolicy" | "fallback" {
  if (variableKey === "cta") return "cta";
  if (variableKey === "format") return "format";
  if (variableKey === "generation_mode") return "generationMode";
  if (variableKey === "style_policy") return "stylePolicy";
  return "fallback";
}

export default function OutputLearningRecommendationCard({
  campaignId,
  onAccept,
  onEdit,
}: OutputLearningRecommendationCardProps) {
  const t = useTranslations("campaigns.outputLearning");
  const tConfidence = useTranslations("campaigns.learnings.confidence");
  const { data, isLoading, isError } = useOutputLearningRecommendation(campaignId);
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const viewedRef = useRef(false);
  const [dismissedLocally, setDismissedLocally] = useState(false);

  const recommendation = data?.recommendation ?? null;
  const dismissKey = recommendation
    ? outputRecommendationDismissStorageKey(campaignId, recommendation.id)
    : null;
  const dismissedFromStorage =
    typeof window !== "undefined" &&
    dismissKey !== null &&
    sessionStorage.getItem(dismissKey) === "1";
  const dismissed = dismissedFromStorage || dismissedLocally;

  useEffect(() => {
    if (!recommendation || viewedRef.current || dismissed) return;

    viewedRef.current = true;
    recordEvent("output_learning_recommendation_viewed", {
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
      outputRecommendationDismissStorageKey(campaignId, recommendation.id),
      "1",
    );
    recordEvent("output_learning_recommendation_dismissed", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      reasonCode: "user_dismissed",
    });
    setDismissedLocally(true);
  };

  const handleAccept = () => {
    const prefill = toRecipePrefill(recommendation.prefill);
    const applicationSnapshot = buildApplicationSnapshotFromAccept({
      traceId: recommendation.appliedLearningTrace.traceId,
      recommendationId: recommendation.id,
      primaryVariableKey: recommendation.primaryVariableKey,
      algorithmVersion: recommendation.appliedLearningTrace.algorithmVersion,
      safetyVersion: recommendation.appliedLearningTrace.safetyVersion,
    });
    recordEvent("output_learning_recommendation_accepted", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      recipeId: prefill.recipeId,
      action: "accept",
      traceId: recommendation.appliedLearningTrace.traceId,
      evidenceEventCount: recommendation.appliedLearningTrace.entries.reduce(
        (count, entry) => count + entry.evidenceEventIds.length,
        0,
      ),
      blockedFieldCount: recommendation.appliedLearningTrace.blockedFields.length,
    });
    onAccept({ prefill, applicationSnapshot });
  };

  const handleEdit = () => {
    const prefill = toRecipePrefill(recommendation.prefill);
    recordEvent("output_learning_recommendation_edited", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      recipeId: prefill.recipeId,
      action: "edit",
    });
    onEdit(prefill);
  };

  const titleKey = titleKeyForVariable(recommendation.primaryVariableKey);
  const titleParams: Record<string, string> =
    titleKey === "fallback"
      ? { key: recommendation.primaryVariableKey, value: recommendation.primaryVariableValue }
      : { value: recommendation.primaryVariableValue };

  return (
    <article className="rounded-lg border border-[var(--neutral-border)] bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--neutral-text)]">
            {t("eyebrow")}
          </p>
          <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">
            {t(`titles.${titleKey}`, titleParams)}
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
              events: recommendation.sampleEventCount,
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

      {recommendation.avoidPatterns.length > 0 ? (
        <div className="mt-3 rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning-text)]">
          <p className="font-medium">{t("avoidPatternsTitle")}</p>
          <ul className="mt-1 space-y-1">
            {recommendation.avoidPatterns.map((item) => (
              <li key={item.pattern}>{item.statement}</li>
            ))}
          </ul>
        </div>
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
