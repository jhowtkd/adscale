"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  categorizeCreativeWorkFailure,
  isCreativeWorkRetryEligible,
  type CreativeWorkOutput,
} from "@/lib/hooks/use-creative-work";
import {
  getCreativeWorkEvaluatorSummary,
  getCreativeWorkSelectionPolicy,
} from "@/lib/creative-work-selection-policy";
import { ActionStatusIcon } from "@/components/animations/ActionStatusIcon";
import {
  isLayerizationRetryableFailure,
  type LayerizationFailureCode,
} from "@/server/layerize/contracts";
import type {
  DeterministicBrandFidelityReport,
  ResidualBrandFidelityReview,
} from "@/server/creative-work/brand-fidelity";
import type { LayerEditorAccessV1 } from "@/server/layer-editor/contracts";

type CreativeResultCardProps = {
  output: CreativeWorkOutput;
  label: string;
  onRetry: (outputId: string) => void;
  onRetryRevision?: (output: CreativeWorkOutput) => void | Promise<void>;
  onApprove: (outputId: string, confirmObjective?: boolean) => void;
  onDownload: (outputId: string) => void;
  onRevise?: (outputId: string, instruction: string, attachment: File | null) => void | Promise<void>;
  isRetrying?: boolean;
  isApproving?: boolean;
  approvalError?: boolean;
  isRevising?: boolean;
  hidePreview?: boolean;
  canLayerize?: boolean;
  onLayerize?: (outputId: string, retry?: boolean, operationId?: string) => Promise<"accepted" | "terminal" | "uncertain" | void> | void;
  onDownloadLayerized?: (outputId: string, format: "psd" | "zip") => void;
  isLayerizing?: boolean;
  onOpenLayerEditor?: (outputId: string) => void;
  layerEditorAccess?: LayerEditorAccessV1;
  isMobile?: boolean;
};

const STATUS_LABELS: Record<CreativeWorkOutput["status"], string> = {
  queued: "Na fila",
  processing: "Processando",
  completed: "Pronto",
  failed: "Falhou",
};

const actionClass = "inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60";

const LAYERIZATION_FAILURE_KEYS: Record<LayerizationFailureCode, "unsafeMedia" | "fidelity" | "invalidResponse" | "provider" | "unknown"> = {
  unsafe_media: "unsafeMedia",
  fidelity_gate_failed: "fidelity",
  invalid_provider_response: "invalidResponse",
  provider_error: "provider",
  dispatch_failed: "unknown",
  missing_configuration: "unknown",
  source_missing: "unknown",
  no_longer_eligible: "unknown",
  storage_error: "unknown",
  submission_unknown: "unknown",
};

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
  approvalError = false,
  isRevising = false,
  hidePreview = false,
  canLayerize = false,
  onLayerize,
  onDownloadLayerized,
  isLayerizing = false,
  onOpenLayerEditor,
  layerEditorAccess,
  isMobile = false,
}: CreativeResultCardProps) {
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSelection, setConfirmingSelection] = useState(false);
  const [layerizeConfirmation, setLayerizeConfirmation] = useState<{ operationId: string; retry: boolean } | null>(null);
  const [submittingLayerize, setSubmittingLayerize] = useState(false);
  const t = useTranslations("dashboard.home.composer.results");
  const layerizeRegionRef = useRef<HTMLDivElement>(null);
  const layerizationWasBusy = useRef(false);
  const isCompleted = output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey));
  const isRevision = Boolean(output.parentOutputId);
  // R-008: failure categories are stable and typed; the free retry exists
  // only while the durable image-call budget has a call (R-006).
  const failureCategory = output.status === "failed"
    ? categorizeCreativeWorkFailure(output.failureCode)
    : null;
  const retryEligible = isCreativeWorkRetryEligible(output);
  // R-008: `inconclusive` is an available output with a review signal — never
  // a failure, never an objective approval.
  const selectionPolicy = isCompleted ? getCreativeWorkSelectionPolicy(output.quality) : null;
  const objectiveVerdict = selectionPolicy?.verdict === "legacy" ? null : selectionPolicy?.verdict ?? null;
  const evaluatorSummary = objectiveVerdict === "inconclusive"
    ? getCreativeWorkEvaluatorSummary(output.quality)
    : null;
  const layerization = output.layerization;
  const layerizationBusy = layerization?.status === "queued" || layerization?.status === "processing" || layerization?.status === "reconciling" || layerization?.status === "finalizing";
  const layerizationRetryable = isLayerizationRetryableFailure(layerization);
  const layerizationFailureMessage = t(`layerizeFailure.${layerization?.failureCode
    ? LAYERIZATION_FAILURE_KEYS[layerization.failureCode]
    : "unknown"}`);
  const layerizeRemaining = layerEditorAccess?.layerize?.remaining ?? null;
  const canStartLayerize = canLayerize && !isMobile && (layerizeRemaining === null || layerizeRemaining > 0);
  useEffect(() => {
    if (layerizationBusy || isLayerizing) {
      layerizationWasBusy.current = true;
      return;
    }
    if (layerizationWasBusy.current && (layerization?.status === "completed" || layerization?.status === "failed" || layerization?.status === "submission_unknown")) {
      layerizationWasBusy.current = false;
      layerizeRegionRef.current?.focus();
    }
  }, [isLayerizing, layerization?.status, layerizationBusy]);
  const storedBrandFidelity = output.quality?.brandFidelity as {
    deterministic?: DeterministicBrandFidelityReport;
    residual?: ResidualBrandFidelityReview;
  } | undefined;
  const deterministicBrandFidelity = storedBrandFidelity?.deterministic?.deterministic === true
    && Array.isArray(storedBrandFidelity.deterministic.checks)
    ? storedBrandFidelity.deterministic
    : null;
  const residualBrandFidelity = storedBrandFidelity?.residual?.advisoryOnly === true
    && Array.isArray(storedBrandFidelity.residual.signals)
    ? storedBrandFidelity.residual
    : null;

  const confirmLayerize = async () => {
    if (!layerizeConfirmation || !onLayerize) return;
    setSubmittingLayerize(true);
    try {
      const outcome = await onLayerize(output.id, layerizeConfirmation.retry, layerizeConfirmation.operationId);
      if (outcome !== "uncertain") setLayerizeConfirmation(null);
    } finally {
      setSubmittingLayerize(false);
    }
  };

  return (
    <div
      data-testid="proposal-level"
      data-level={output.creativeLevel}
      data-status={output.status}
      role="listitem"
      className="flex flex-col gap-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          <span data-testid="proposal-level-name">{label}</span>
          <span className="ml-1 text-[var(--text-muted)]">· {output.targetFormat ?? "4:5"} · v{output.versionNumber ?? 1}</span>
        </p>
        <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[var(--text-caption)] uppercase tracking-wider text-[var(--text-muted)]">
          {STATUS_LABELS[output.status]}
        </span>
      </header>

      {!hidePreview ? <div className="w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]" style={{ aspectRatio: (output.targetFormat ?? "4:5").replace(":", " / ") }}>
        {isCompleted ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/creative-work/${output.workItemId}/outputs/${output.id}/download`}
            alt={`Proposta ${label}`}
            className="h-full w-full object-contain"
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
      </div> : null}

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

      {selectionPolicy && !selectionPolicy.selectable ? (
        <div
          role="note"
          data-testid="objective-selection-blocked"
          className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-text)]"
        >
          <p className="font-medium">{t("objectiveFailed")}</p>
          <p className="mt-0.5">{t("objectiveFailedNext")}</p>
        </div>
      ) : null}

      {selectionPolicy?.verdict === "legacy" && selectionPolicy.selectable ? (
        <div role="note" data-testid="legacy-selection-review" className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {t("legacyReviewRequired")}
        </div>
      ) : null}

      {deterministicBrandFidelity ? (
        <section
          data-testid="brand-fidelity-deterministic"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">{t("brandFidelityTitle")}</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {deterministicBrandFidelity.checks.map((brandCheck) => (
              <li key={brandCheck.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">{t(`brandFidelityCheck.${brandCheck.id}`)}</span>
                  <span className={brandCheck.state === "nonconforming" ? "text-[var(--danger-text)]" : "text-[var(--text-muted)]"}>
                    {t(`brandFidelityState.${brandCheck.state}`)}
                  </span>
                </div>
                {brandCheck.evidence.length > 0 ? (
                  <p className="break-all text-[var(--text-caption)] text-[var(--text-muted)]">
                    {brandCheck.evidence.map((item) => item.path).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {residualBrandFidelity && residualBrandFidelity.status !== "clear" ? (
        <section
          role="note"
          data-testid="brand-fidelity-residual"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">
            {t(residualBrandFidelity.status === "suspected" ? "visualSuspicionTitle" : "visualInconclusiveTitle")}
          </h3>
          <ul className="mt-1 space-y-1 text-xs text-[var(--text-muted)]">
            {residualBrandFidelity.signals.map((signal) => (
              <li key={`${signal.classification}:${signal.code}`}>
                <p>{signal.note}</p>
                <p>{signal.confidence === null
                  ? t("visualNoConfidence")
                  : t("visualConfidence", { value: Math.round(signal.confidence * 100) })}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {output.status === "failed" ? (
        isRevision ? (
          onRetryRevision ? (
            <button type="button" className={actionClass} disabled={isRevising} onClick={() => onRetryRevision(output)}>
              Tentar novamente
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
            {selectionPolicy?.selectable ? (
              <button
                type="button"
                className={actionClass}
                aria-busy={isApproving}
                disabled={isApproving || output.isSelected}
                onClick={() => {
                  if (selectionPolicy.requiresConfirmation && !confirmingSelection) {
                    setConfirmingSelection(true);
                    return;
                  }
                  if (selectionPolicy.requiresConfirmation) onApprove(output.id, true);
                  else onApprove(output.id);
                }}
              >
                <ActionStatusIcon state={isApproving ? "pending" : output.isSelected ? "success" : approvalError ? "error" : "idle"} />
                {isApproving
                  ? "Aprovando"
                  : output.isSelected
                    ? "Aprovada"
                    : approvalError
                      ? "Tentar novamente"
                      : selectionPolicy.requiresConfirmation
                        ? confirmingSelection ? t("confirmApproval") : t("reviewBeforeApprove")
                        : "Aprovar"}
              </button>
            ) : null}
            <button type="button" className={actionClass} onClick={() => onDownload(output.id)}>Baixar</button>
            {(layerization?.status === "completed" || output.layerEditor) && onOpenLayerEditor ? <button type="button" className={actionClass} onClick={() => onOpenLayerEditor(output.id)}>{output.isSelected ? "Editar camadas" : "Visualizar camadas"}</button> : null}
            {layerization?.status === "completed" && onDownloadLayerized ? <button type="button" className={`${actionClass} border-[var(--focus-ring)]`} onClick={() => onDownloadLayerized(output.id, "psd")}>{t("downloadPsdWithLayers", { count: layerization.layers.length })}</button> : null}
            {onRevise ? <button type="button" className={actionClass} aria-expanded={editing} onClick={() => setEditing((value) => !value)}>Refinar</button> : null}
          </div>
          {output.isSelected && onLayerize && !isMobile && (canLayerize || layerization) ? (
            <div ref={layerizeRegionRef} tabIndex={-1} aria-busy={layerizationBusy || isLayerizing} className="space-y-2 border-t border-[var(--border-subtle)] pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" data-testid="layerization-actions">
              <p className="text-xs font-medium text-[var(--text-secondary)]">{t("layerizeSection")}</p>
              {layerizeRemaining !== null ? <p className="text-xs text-[var(--text-secondary)]">{t("layerizeQuotaRemaining", { count: layerizeRemaining })}</p> : null}
              {!layerization || layerization.status === "failed" ? (
                <>
                  {layerization?.status === "failed" ? (
                    <p className="text-xs text-[var(--text-secondary)]">{layerizationFailureMessage}</p>
                  ) : null}
                  {(!layerization || layerizationRetryable) ? (
                    <button
                      type="button"
                      className={actionClass}
                      aria-busy={isLayerizing}
                      disabled={isLayerizing || !canStartLayerize}
                      onClick={() => setLayerizeConfirmation({ operationId: crypto.randomUUID(), retry: Boolean(layerization) })}
                    >
                      {isLayerizing ? t("layerizeProcessing") : layerization ? t("layerizeRetry") : t("layerizeStart")}
                    </button>
                  ) : null}
                </>
              ) : layerization.status === "submission_unknown" ? (
                <p className="text-xs text-[var(--text-secondary)]">{t("layerizeSubmissionUnknown")}</p>
              ) : layerization.status === "completed" ? (
                <p className="text-xs text-[var(--text-secondary)]">{t("layerizeCompleted")}</p>
              ) : (
                <>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {layerization.status === "queued" ? t("layerizeQueued") : layerization.status === "processing" ? t("layerizeProcessing") : layerization.status === "finalizing" ? t("layerizeFinalizing") : t("layerizeReconciling")}
                  </p>
                  {layerization.status === "queued" && layerization.operationId ? <button type="button" className={actionClass} disabled={isLayerizing || submittingLayerize} onClick={() => setLayerizeConfirmation({ operationId: layerization.operationId, retry: false })}>{t("editorRetryDispatch")}</button> : null}
                </>
              )}
              {layerizeConfirmation ? <div role="dialog" aria-label={t("layerizeConfirmTitle")} className="rounded-[var(--radius-control)] border border-[var(--border-default)] p-3">
                <p className="text-sm">{t("layerizeConfirmDescription")}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={actionClass} onClick={() => setLayerizeConfirmation(null)}>{t("layerizeCancel")}</button>
                  <button type="button" className={actionClass} disabled={isLayerizing || submittingLayerize} onClick={() => void confirmLayerize()}>{t("layerizeConfirm")}</button>
                </div>
              </div> : null}
              <p aria-live="polite" className="sr-only" data-testid="layerization-live-region">
                {layerization?.status === "queued"
                  ? t("layerizeQueued")
                  : layerization?.status === "processing"
                    ? t("layerizeProcessing")
                    : layerization?.status === "reconciling"
                      ? t("layerizeReconciling")
                      : layerization?.status === "finalizing"
                        ? t("layerizeFinalizing")
                        : layerization?.status === "submission_unknown"
                          ? t("layerizeSubmissionUnknown")
                          : layerization?.status === "completed"
                            ? t("layerizeCompleted")
                            : layerization?.status === "failed"
                              ? t("layerizeFailed")
                              : null}
              </p>
            </div>
          ) : null}
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
                Gerar nova versão
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
