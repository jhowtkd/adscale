"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Columns2, Maximize2, Sparkles, X } from "lucide-react";
import { CreativeResultCard } from "./CreativeResultCard";
import { PieceFormatPopover } from "./PieceFormatPopover";
import { PieceReviewCanvas } from "./PieceReviewCanvas";
import { LayerEditorContent } from "./layer-editor/LayerEditorContent";
import { LayerScanner } from "./layer-editor/LayerScanner";
import { useOutputReview } from "./useOutputReview";
import {
  hasUsableOutput,
  outputLineage,
  outputSource,
  visualVersionNumber,
} from "./composer-outputs";
import type { CreativeComposerViewModel } from "./useCreativeComposer";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import styles from "./studio-piece-workspace.module.css";

function byCreationOrder(left: CreativeWorkOutput, right: CreativeWorkOutput) {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    || left.id.localeCompare(right.id);
}

/**
 * The approved contained box for one Peça única: the artwork dominates,
 * thumbnails sit beside it, comments pin onto the rendered image and every
 * review goes through the frozen confirm step before anything is generated.
 */
export function StudioPieceWorkspace({ composer }: { composer: CreativeComposerViewModel }) {
  const t = useTranslations("dashboard.home.composer.results");
  const isMobile = useIsMobile();
  const outputs = useMemo(() => [...composer.outputs].sort(byCreationOrder), [composer.outputs]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = (selectedId ? outputs.find((output) => output.id === selectedId) : undefined)
    ?? [...outputs].reverse().find(hasUsableOutput)
    ?? outputs[outputs.length - 1];

  const workItemId = composer.workId ?? selected?.workItemId ?? "";
  const review = useOutputReview({
    workItemId,
    output: selected!,
    revisionCreditCost: composer.revisionCreditCost ?? null,
  });

  // Only an own confirmation moves the selection; polling never steals it.
  useEffect(() => {
    if (review.pendingOutputId) setSelectedId(review.pendingOutputId);
  }, [review.pendingOutputId]);

  const ancestor = useMemo(
    () => (selected ? outputLineage(outputs, selected).slice(1).find(hasUsableOutput) ?? null : null),
    [outputs, selected],
  );
  const displayOutput = selected && hasUsableOutput(selected)
    ? selected
    : ancestor ?? selected;
  const displaySrc = displayOutput ? outputSource(displayOutput) : "";
  const selectedCompleted = Boolean(selected && hasUsableOutput(selected));

  const readyLayers = Boolean(selected && (selected.layerization?.status === "completed" || selected.layerEditor));
  const layerizeRemaining = composer.layerEditorAccess?.layerize?.remaining ?? null;

  const startLayerize = useCallback(() => {
    if (!composer.layerizeOutput || !selected) return;
    const state = selected.layerization;
    const retry = state?.status === "failed";
    const operationId = state?.status === "queued" ? state.operationId : crypto.randomUUID();
    void Promise.resolve(composer.layerizeOutput(selected.id, retry, operationId)).catch(() => undefined);
  }, [composer, selected]);

  if (outputs.length === 0 || !selected) return null;

  const versionLabel = t("versionLabel", { count: visualVersionNumber(outputs, selected) });
  const reviewed = review.phase === "reviewing" || review.phase === "submitting" || review.phase === "reconciling";

  const expand = () => {
    const request = containerRef.current?.requestFullscreen?.();
    if (request) request.catch(() => undefined);
  };
  const collapse = () => {
    if (document.fullscreenElement) {
      const exit = document.exitFullscreen?.();
      if (exit) exit.catch(() => undefined);
    }
  };

  return (
    <section data-testid="studio-piece-workspace" aria-label={composer.workTitle ?? t("title")} className={styles.inner}>
      <header className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{composer.workTitle ?? t("title")}</p>
          <span className="shrink-0 text-xs text-[var(--text-muted)]">{versionLabel} · {selected.targetFormat}</span>
          {!selectedCompleted ? (
            <span role="status" className="shrink-0 rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {t(`status.${selected.status}`)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-2">
          {ancestor && selectedCompleted ? (
            <button
              type="button"
              aria-pressed={compareOpen}
              onClick={() => setCompareOpen((value) => !value)}
              className="inline-flex min-h-[var(--control-touch)] items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {compareOpen ? <X size={14} aria-hidden="true" /> : <Columns2 size={14} aria-hidden="true" />}
              {compareOpen ? t("closeCompare") : t("compareWithBase")}
            </button>
          ) : null}
          {!selectedCompleted ? null : (
            <button
              type="button"
              onClick={expand}
              aria-label={t("expandPiece")}
              className="inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            aria-pressed={layersOpen}
            disabled={!composer.canLayerize}
            title={composer.canLayerize ? undefined : t("layersUnavailable")}
            onClick={() => { setCompareOpen(false); setLayersOpen((value) => !value); }}
            className="inline-flex min-h-[var(--control-touch)] items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {t("layersPanel")}
          </button>
        </div>
      </header>

      <div ref={containerRef} className={styles.visual}>
        <div className={styles.artGroup}>
          <div className={styles.versions} aria-label={t("title")}>
            {outputs.map((output) => (
              <button
                key={output.id}
                type="button"
                aria-pressed={output.id === selected.id}
                aria-label={`${t("versionLabel", { count: visualVersionNumber(outputs, output) })} · ${output.targetFormat}`}
                onClick={() => setSelectedId(output.id)}
                className={`${styles.thumb} rounded-[var(--radius-control)] border border-transparent bg-[var(--surface-inset)] aria-pressed:border-[var(--focus-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
              >
                {hasUsableOutput(output) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={outputSource(output)} alt="" loading="lazy" />
                ) : (
                  <span aria-hidden="true" className="text-[10px] text-[var(--text-muted)]">
                    {output.status === "failed" ? "!" : "…"}
                  </span>
                )}
              </button>
            ))}
          </div>

          {compareOpen && ancestor && selectedCompleted ? (
            <div className={styles.compare}>
              <figure className="flex min-h-0 min-w-0 flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={outputSource(selected)} alt={`${versionLabel} · ${selected.targetFormat}`} className={styles.art} />
                <figcaption className="text-xs text-[var(--text-muted)]">{versionLabel} · {selected.targetFormat}</figcaption>
              </figure>
              <figure className="flex min-h-0 min-w-0 flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={outputSource(ancestor)} alt={`${t("versionLabel", { count: visualVersionNumber(outputs, ancestor) })} · ${ancestor.targetFormat}`} className={styles.art} />
                <figcaption className="text-xs text-[var(--text-muted)]">{t("versionLabel", { count: visualVersionNumber(outputs, ancestor) })} · {ancestor.targetFormat}</figcaption>
              </figure>
            </div>
          ) : layersOpen ? (
            readyLayers ? (
              <LayerEditorContent
                open
                workItemId={workItemId}
                outputId={selected.id}
                mode={isMobile ? "inspect" : "edit"}
                presentation="inline"
                onOpenChange={(open) => { if (!open) setLayersOpen(false); }}
                onPublished={composer.refreshOutputs}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
                {displaySrc ? (
                  <LayerScanner
                    sourceImageUrl={displaySrc}
                    layerization={selected.layerization ?? null}
                    layerizeRemaining={layerizeRemaining}
                    onRetryLayerize={startLayerize}
                  />
                ) : null}
                {composer.canLayerize ? (
                  <button
                    type="button"
                    disabled={layerizeRemaining === 0 || Boolean(composer.isLayerizingOutput?.(selected.id))}
                    onClick={startLayerize}
                    className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    {t("layersGenerate")}
                  </button>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">{t("layersUnavailable")}</p>
                )}
                {layerizeRemaining !== null ? <p className="text-xs text-[var(--text-secondary)]">{t("layerizeQuotaRemaining", { count: layerizeRemaining })}</p> : null}
              </div>
            )
          ) : selectedCompleted || displaySrc ? (
            <PieceReviewCanvas
              src={displaySrc}
              alt={t("pieceAlt", { label: `${versionLabel} · ${selected.targetFormat}` })}
              annotations={review.draft.annotations}
              onChange={(annotations) => review.update({ annotations })}
            />
          ) : (
            <div role="status" className="flex flex-col items-center justify-center gap-2 p-6 text-sm text-[var(--text-muted)]">
              <Sparkles size={18} aria-hidden="true" />
              <span>{t(`status.${selected.status}`)}</span>
            </div>
          )}
        </div>
      </div>

      <footer className={styles.dock}>
        <CreativeResultCard
          presentation="workspace"
          output={selected}
          label={versionLabel}
          hidePreview
          retryCreditCost={composer.revisionCreditCost}
          onRetry={composer.retryOutput}
          onRetryRevision={composer.retryRevisionOutput}
          onApprove={composer.approveOutput}
          onDownload={composer.downloadOutput}
          isRetrying={composer.isRetryingOutput?.(selected.id)}
          isApproving={composer.isApprovingOutput?.(selected.id)}
          approvalError={composer.approvalErrorOutputId === selected.id}
        />

        {review.error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{review.error}</p> : null}
        {composer.error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{composer.error}</p> : null}

        {selectedCompleted && !layersOpen ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm font-medium text-[var(--text-primary)]">
                <span className="sr-only">{t("reviewInstruction")}</span>
                <textarea
                  aria-label={t("reviewInstruction")}
                  value={review.draft.instruction}
                  onChange={(event) => review.update({ instruction: event.target.value })}
                  placeholder={t("reviewInstruction")}
                  rows={2}
                  className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                />
              </label>
              <div className="flex flex-none flex-wrap items-center gap-2">
                <PieceFormatPopover
                  value={review.draft.action === "format" ? review.draft.targetFormat : null}
                  onChoose={(format) => review.update({ action: "format", targetFormat: format })}
                  onCancel={() => review.update({ action: "refine", targetFormat: selected.targetFormat })}
                />
                <button
                  type="button"
                  aria-pressed={review.draft.action === "variation"}
                  onClick={() => review.update({ action: "variation", targetFormat: selected.targetFormat })}
                  className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] aria-pressed:border-[var(--selection-border)] aria-pressed:bg-[var(--selection-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {t("createVariation")}
                </button>
                <button
                  type="button"
                  disabled={review.referencePending || reviewed}
                  onClick={() => void review.review()}
                  className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {t("reviewAction")}
                </button>
              </div>
            </div>
            <p role="status" aria-live="polite" className="text-xs text-[var(--text-muted)]">
              {review.referencePending
                ? t("referenceUploading")
                : review.saveState === "saving"
                  ? t("commentSaving")
                  : review.saveState === "saved"
                    ? t("commentSaved")
                    : review.saveState === "error"
                      ? t("commentSaveError")
                      : ""}
            </p>
          </>
        ) : null}

        {review.phase === "reviewing" ? (
          <section
            aria-label={t("reviewAction")}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-3"
            data-testid="piece-review-confirmation"
          >
            <div className="min-w-0 text-sm text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">
                {review.draft.action === "format"
                  ? `${t("formatTrigger")}: ${review.draft.targetFormat}`
                  : review.draft.action === "variation"
                    ? t("createVariation")
                    : t("reviewInstruction")}
              </p>
              <p className="truncate">{review.draft.instruction}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {t("reviewAnnotations", { count: review.draft.annotations.length })}
                {" · "}
                {t("reviewCostLine", { count: composer.revisionCreditCost ?? 0 })}
              </p>
            </div>
            <div className="flex flex-none gap-2">
              <button
                type="button"
                onClick={review.edit}
                className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {t("refine")}
              </button>
              <button
                type="button"
                disabled={review.isBusy}
                onClick={() => void review.confirm()}
                data-testid="piece-review-confirm"
                className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {review.phase === "submitting"
                  ? t("sendingRevision")
                  : review.phase === "reconciling"
                    ? t("reconcilingRevision")
                    : t("confirmRevision")}
              </button>
            </div>
          </section>
        ) : null}
      </footer>
    </section>
  );
}
