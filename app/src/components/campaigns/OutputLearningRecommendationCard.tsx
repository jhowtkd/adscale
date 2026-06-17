"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import {
  outputRecommendationDismissStorageKey,
  useOutputLearningRecommendation,
  type OutputGenerationPrefill,
} from "@/lib/hooks/use-output-learning-recommendation";
import { CONFIDENCE_LABELS } from "@/lib/hooks/use-performance-learnings";

export interface RecipePrefillPayload {
  recipeId: OutputGenerationPrefill["recipeId"];
  config: Omit<OutputGenerationPrefill, "recipeId">;
}

interface OutputLearningRecommendationCardProps {
  campaignId: string;
  onAccept: (prefill: RecipePrefillPayload) => void;
  onEdit: (prefill: RecipePrefillPayload) => void;
}

function toRecipePrefill(prefill: OutputGenerationPrefill): RecipePrefillPayload {
  const { recipeId, ...config } = prefill;
  return { recipeId, config };
}

function primaryLabel(variableKey: string, variableValue: string): string {
  if (variableKey === "cta") return `Testar CTA "${variableValue}"`;
  if (variableKey === "format") return `Priorizar formato ${variableValue}`;
  if (variableKey === "generation_mode") return `Usar modo ${variableValue}`;
  if (variableKey === "style_policy") return `Aplicar estilo ${variableValue}`;
  return `Explorar ${variableKey} ${variableValue}`;
}

export default function OutputLearningRecommendationCard({
  campaignId,
  onAccept,
  onEdit,
}: OutputLearningRecommendationCardProps) {
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
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Carregando recomendação de output learning…
      </p>
    );
  }

  if (isError || data?.status !== "ready" || !recommendation || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem(
      outputRecommendationDismissStorageKey(campaignId, recommendation.id),
      "1"
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
    recordEvent("output_learning_recommendation_accepted", {
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
    recordEvent("output_learning_recommendation_edited", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      recipeId: prefill.recipeId,
      action: "edit",
    });
    onEdit(prefill);
  };

  return (
    <article className="rounded-lg border border-[var(--accent-green)]/30 bg-[var(--bg-elevated)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-green-text)]">
            Aprendizado de output sugerido
          </p>
          <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">
            {primaryLabel(
              recommendation.primaryVariableKey,
              recommendation.primaryVariableValue
            )}
          </h3>
        </div>
        <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-xs">
          Confiança {CONFIDENCE_LABELS[recommendation.confidence]}
        </span>
      </header>

      <p className="mt-3 text-sm text-[var(--text-primary)]">
        {recommendation.justification}
      </p>

      <dl className="mt-4 grid gap-3 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
        <div>
          <dt className="font-medium text-[var(--text-primary)]">Amostra</dt>
          <dd>
            {recommendation.sampleEventCount} evento(s) ·{" "}
            {recommendation.sampleCampaignCount} campanha(s)
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">Evidências</dt>
          <dd>
            {recommendation.evidence.length} aprendizado(s) · score{" "}
            {recommendation.confidenceScore}
          </dd>
        </div>
      </dl>

      {recommendation.evidence.length > 0 ? (
        <ul className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
          {recommendation.evidence.map((item) => (
            <li
              key={item.learningId}
              className="rounded border border-[var(--border-dim)] bg-[var(--bg-surface)] px-3 py-2"
            >
              {item.statement}
            </li>
          ))}
        </ul>
      ) : null}

      {recommendation.avoidPatterns.length > 0 ? (
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <p className="font-medium">Padrões a evitar (informativo — não altera prompt)</p>
          <ul className="mt-1 space-y-1">
            {recommendation.avoidPatterns.map((item) => (
              <li key={item.pattern}>{item.statement}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {recommendation.contradictions.length > 0 ? (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {recommendation.contradictions.length} evidência(s) contraditória(s) —
          revise antes de escalar.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleAccept}>
          Aceitar e abrir receita
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleEdit}>
          Editar antes de gerar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleDismiss}>
          Ignorar
        </Button>
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-secondary)]">
        Apenas variáveis limitadas (CTA, modo, formato, receita, estilo) — sem alteração de prompt.
      </p>
    </article>
  );
}
