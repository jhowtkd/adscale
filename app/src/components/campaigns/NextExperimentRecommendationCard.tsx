"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import {
  recommendationDismissStorageKey,
  useNextExperimentRecommendation,
  type NextExperimentPrefill,
} from "@/lib/hooks/use-next-experiment-recommendation";
import { CONFIDENCE_LABELS } from "@/lib/hooks/use-performance-learnings";

export interface RecipePrefillPayload {
  recipeId: NextExperimentPrefill["recipeId"];
  config: Omit<NextExperimentPrefill, "recipeId">;
}

interface NextExperimentRecommendationCardProps {
  campaignId: string;
  onAccept: (prefill: RecipePrefillPayload) => void;
  onEdit: (prefill: RecipePrefillPayload) => void;
}

function toRecipePrefill(
  prefill: NextExperimentPrefill
): RecipePrefillPayload {
  const { recipeId, ...config } = prefill;
  return { recipeId, config };
}

export default function NextExperimentRecommendationCard({
  campaignId,
  onAccept,
  onEdit,
}: NextExperimentRecommendationCardProps) {
  const { data, isLoading, isError } = useNextExperimentRecommendation(campaignId);
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const viewedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const recommendation = data?.recommendation ?? null;

  useEffect(() => {
    if (!recommendation || viewedRef.current) return;

    const dismissKey = recommendationDismissStorageKey(
      campaignId,
      recommendation.id
    );
    if (sessionStorage.getItem(dismissKey) === "1") {
      setDismissed(true);
      return;
    }

    viewedRef.current = true;
    recordEvent("next_experiment_viewed", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      learningCount: recommendation.evidence.length,
      source: recommendation.learningsSource,
    });
  }, [campaignId, recommendation, recordEvent]);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Carregando recomendação de próximo experimento…
      </p>
    );
  }

  if (isError || data?.status !== "ready" || !recommendation || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem(
      recommendationDismissStorageKey(campaignId, recommendation.id),
      "1"
    );
    recordEvent("next_experiment_dismissed", {
      recommendationId: recommendation.id,
      variableKey: recommendation.primaryVariableKey,
      confidence: recommendation.confidence,
      reasonCode: "user_dismissed",
    });
    setDismissed(true);
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

  return (
    <article className="rounded-lg border border-[var(--accent-green)]/30 bg-[var(--bg-elevated)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-green-text)]">
            Próximo experimento sugerido
          </p>
          <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">
            {recommendation.primaryVariableKey === "cta"
              ? `Testar CTA "${recommendation.primaryVariableValue}"`
              : recommendation.primaryVariableKey === "format"
                ? `Priorizar formato ${recommendation.primaryVariableValue}`
                : recommendation.primaryVariableKey === "recipe"
                  ? `Usar receita ${recommendation.primaryVariableValue}`
                  : `Explorar estilo ${recommendation.primaryVariableValue}`}
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
            {recommendation.sampleImpressions.toLocaleString("pt-BR")} impressões ·{" "}
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
        Nenhuma alteração automática em campanha, mídia ou orçamento — você confirma cada passo.
      </p>
    </article>
  );
}
