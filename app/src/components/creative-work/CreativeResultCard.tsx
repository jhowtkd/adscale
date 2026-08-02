"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  categorizeCreativeWorkFailure,
  getCreativeWorkEvaluatorSummary,
  getCreativeWorkObjectiveVerdict,
  isCreativeWorkRetryEligible,
  type CreativeWorkOutput,
} from "@/lib/hooks/use-creative-work";
import { ActionStatusIcon } from "@/components/animations/ActionStatusIcon";

type CreativeResultCardProps = {
  output: CreativeWorkOutput;
  label: string;
  onRetry: (outputId: string) => void;
  onRetryRevision?: (output: CreativeWorkOutput) => void | Promise<void>;
  onApprove: (outputId: string) => void;
  onDownload: (outputId: string) => void;
  onRevise?: (outputId: string, instruction: string, attachment: File | null) => void | Promise<void>;
  isRetrying?: boolean;
  isApproving?: boolean;
  isRevising?: boolean;
};

const STATUS_LABELS: Record<CreativeWorkOutput["status"], string> = {
  queued: "Na fila",
  processing: "Processando",
  completed: "Pronto",
  failed: "Falhou",
};

const actionClass = "inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60";

export function CreativeResultCard({
  output,
  label,
  onRetry,
  onRetryRevision,
  onApprove,
  onDownload,
  onRevise,
  isRetrying = false,
  isApproving = false,
  isRevising = false,
}: CreativeResultCardProps) {
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const t = useTranslations("dashboard.home.composer.results");
  const isCompleted = output.status === "completed" && Boolean(output.outputKey);
  const isRevision = Boolean(output.parentOutputId);
  // R-008: failure categories are stable and typed; the free retry exists
  // only while the durable image-call budget has a call (R-006).
  const failureCategory = output.status === "failed"
    ? categorizeCreativeWorkFailure(output.failureCode)
    : null;
  const retryEligible = isCreativeWorkRetryEligible(output);
  // R-008: `inconclusive` is an available output with a review signal — never
  // a failure, never an objective approval.
  const objectiveVerdict = isCompleted ? getCreativeWorkObjectiveVerdict(output.quality) : null;
  const evaluatorSummary = objectiveVerdict === "inconclusive"
    ? getCreativeWorkEvaluatorSummary(output.quality)
    : null;

  return (
    <article
      data-testid="proposal-level"
      data-level={output.creativeLevel}
      data-status={output.status}
      role="listitem"
      className="flex flex-col gap-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          <span data-testid="proposal-level-name">{label}</span>
          <span className="ml-1 text-[var(--text-muted)]">· {output.targetFormat ?? "4:5"} · v{output.versionNumber ?? 1}</span>
        </h3>
        <span aria-label={`Status ${STATUS_LABELS[output.status]}`} className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          {STATUS_LABELS[output.status]}
        </span>
      </header>

      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        {isCompleted ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/creative-work/${output.workItemId}/outputs/${output.id}/download`}
            alt={`Proposta ${label}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div role="status" className="flex h-full flex-col items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
            {output.status === "failed" ? (
              <>
                <span>{t("failedGeneration")}</span>
                {/* One live region per failure: the typed category rides the
                    same status announcement instead of a second role=alert. */}
                <span data-testid="failure-category" className="text-[var(--danger-text)]">
                  {t(`failure.${failureCategory}`)}
                </span>
              </>
            ) : "Gerando..."}
          </div>
        )}
      </div>

      {objectiveVerdict === "inconclusive" ? (
        <div
          role="note"
          data-testid="review-recommended"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <p className="text-xs font-medium text-[var(--text-secondary)]">{t("reviewRecommended")}</p>
          {evaluatorSummary ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{evaluatorSummary}</p>
          ) : null}
        </div>
      ) : null}

      {output.status === "failed" ? (
        isRevision ? (
          onRetryRevision ? (
            <button type="button" className={actionClass} disabled={isRevising} onClick={() => onRetryRevision(output)}>
              Tentar novamente · 5 créditos
            </button>
          ) : null
        ) : retryEligible ? (
          <button type="button" className={actionClass} disabled={isRetrying} onClick={() => onRetry(output.id)}>
            Repetir esta proposta
          </button>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{t("retryUnavailable")}</p>
        )
      ) : null}

      {isCompleted ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={actionClass}
              aria-busy={isApproving}
              disabled={isApproving || output.isSelected}
              onClick={() => onApprove(output.id)}
            >
              <ActionStatusIcon state={isApproving ? "pending" : output.isSelected ? "success" : "idle"} />
              {isApproving ? "Aprovando" : output.isSelected ? "Aprovada" : "Aprovar"}
            </button>
            <button type="button" className={actionClass} onClick={() => onDownload(output.id)}>Baixar</button>
            {onRevise ? <button type="button" className={actionClass} aria-expanded={editing} onClick={() => setEditing((value) => !value)}>Editar</button> : null}
          </div>
          {editing && onRevise ? (
            <form
              className="space-y-3 rounded-[var(--radius-control)] bg-[var(--surface-raised)] p-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (submitting || isRevising) return;
                setSubmitting(true);
                try {
                  await onRevise(output.id, instruction.trim(), attachment);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                O que você quer mudar?
                <textarea
                  aria-label="O que você quer mudar?"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 font-normal"
                />
              </label>
              <label className="block text-sm text-[var(--text-secondary)]">
                Anexo opcional
                <input
                  aria-label="Anexo opcional"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs"
                />
              </label>
              <button type="submit" className={actionClass} disabled={!instruction.trim() || isRevising || submitting}>
                Gerar nova versão · 5 créditos
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
