"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import type { OutputReviewInput } from "./useOutputReview";
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
 * Empty works render nothing and never mount the review session.
 */
export function StudioPieceWorkspace({ composer }: { composer: CreativeComposerViewModel }) {
  if (composer.outputs.length === 0) return null;
  return <StudioPieceWorkspaceSession composer={composer} />;
}

function StudioPieceWorkspaceSession({ composer }: { composer: CreativeComposerViewModel }) {
  const t = useTranslations("dashboard.home.composer.results");
  const isMobile = useIsMobile();
  const outputs = useMemo(() => [...composer.outputs].sort(byCreationOrder), [composer.outputs]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The default selection is captured once per work: later polling arrivals
  // never steal it — only an explicit action or an own confirmation moves it.
  const [defaultSelection, setDefaultSelection] = useState<{ workId: string; outputId: string | null }>({ workId: "", outputId: null });
  const [layersOpen, setLayersOpen] = useState(false);
  const [layersExitToken, setLayersExitToken] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [pendingCompare, setPendingCompare] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  // Frozen context of a failed revision awaiting its explicit resume on the
  // base (only offered when the base already carries a newer draft).
  const [resumeContext, setResumeContext] = useState<{ parentId: string; from: OutputReviewInput } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const workId = composer.workId ?? outputs[0]?.workItemId ?? "";
  const activeDefault = defaultSelection.workId === workId ? defaultSelection.outputId : null;
  // The default selection is FIXED on first sight (guarded render-time
  // adjustment — React re-renders before committing), so polling arrivals
  // never steal it; afterwards only explicit actions change selectedId.
  const effectiveSelectionId = selectedId ?? activeDefault;
  const selected = (effectiveSelectionId ? outputs.find((output) => output.id === effectiveSelectionId) : undefined)
    ?? outputs[outputs.length - 1];
  if (outputs.length > 0 && activeDefault === null) {
    const firstDefault = [...outputs].reverse().find(hasUsableOutput) ?? outputs[outputs.length - 1];
    if (firstDefault) setDefaultSelection({ workId, outputId: firstDefault.id });
  }

  const workItemId = composer.workId ?? selected?.workItemId ?? "";
  const review = useOutputReview({
    workItemId,
    output: selected!,
    revisionCreditCost: composer.revisionCreditCost ?? null,
  });

  const readyLayers = Boolean(selected && (selected.layerization?.status === "completed" || selected.layerEditor));

  /** Keep the editor mounted until flushAndRelease succeeds. */
  const requestLayersExit = useCallback((thenSelect?: string) => {
    setPendingSelection(thenSelect ?? null);
    setLayersExitToken((token) => token + 1);
  }, []);

  // Only an own confirmation moves the selection; polling never steals it.
  if (review.pendingOutputId && review.pendingOutputId !== selectedId) {
    if (layersOpen && readyLayers) {
      if (pendingSelection !== review.pendingOutputId) requestLayersExit(review.pendingOutputId);
    } else {
      if (layersOpen) setLayersOpen(false);
      setSelectedId(review.pendingOutputId);
    }
  }

  // A guarded layer exit finished: apply whatever was requested while the
  // editor held the artwork (selection and/or compare).
  if (!layersOpen && pendingSelection) {
    setSelectedId(pendingSelection);
    setPendingSelection(null);
  }
  if (!layersOpen && pendingCompare) {
    setCompareOpen(true);
    setPendingCompare(false);
  }

  const layerizeRemaining = composer.layerEditorAccess?.layerize?.remaining ?? null;

  const closeLayers = useCallback((open: boolean) => {
    if (!open) setLayersOpen(false);
  }, []);

  /** Manual piece switch: flush the review draft FIRST and only select the
   * target after success; on failure stay on the current piece with its text
   * and the visible error. Editor-held exits keep the flush-path contract. */
  const switchTo = useCallback(async (outputId: string) => {
    if (!selected || outputId === selected.id) return;
    if (review.hasUnsavedChanges()) {
      const saved = await review.flush();
      if (!saved) return;
    }
    if (layersOpen && readyLayers) {
      requestLayersExit(outputId);
      return;
    }
    if (layersOpen) {
      setLayersOpen(false);
    }
    setSelectedId(outputId);
  }, [layersOpen, readyLayers, requestLayersExit, review, selected]);

  /** A failed revision retries through the reviewed flow on its base: switch
   * there, then force a FRESH draft/key — the parent's old revision was
   * already consumed by the failed child and must never be replayed. The
   * child's frozen context seeds the attempt when the base has no draft of
   * its own; otherwise it is offered back as an explicit resume. */
  const retryThroughReview = useCallback((failed: CreativeWorkOutput) => {
    const parentId = failed.parentOutputId;
    if (!parentId) return;
    const parent = outputs.find((output) => output.id === parentId);
    const from: OutputReviewInput | undefined = failed.revisionContext
      ? {
          action: failed.revisionContext.action,
          targetFormat: failed.revisionContext.targetFormat,
          instruction: failed.revisionContext.instruction,
          revisionAssetId: failed.revisionContext.revisionAssetId,
          annotations: failed.revisionContext.annotations,
        }
      : failed.revisionInstruction || failed.revisionAssetId
        ? {
            action: "refine" as const,
            targetFormat: parent?.targetFormat ?? failed.targetFormat,
            instruction: failed.revisionInstruction ?? "",
            revisionAssetId: failed.revisionAssetId ?? null,
            annotations: [],
          }
        : undefined;
    setResumeContext(parent?.reviewDraft && from ? { parentId, from } : null);
    review.beginFreshDraftAttempt({ targetOutputId: parentId, from: parent?.reviewDraft ? undefined : from });
    void switchTo(parentId);
  }, [outputs, review, switchTo]);

    const ancestor = useMemo(
    () => (selected ? outputLineage(outputs, selected).slice(1).find(hasUsableOutput) ?? null : null),
    [outputs, selected],
  );
  const selectedCompleted = Boolean(selected && hasUsableOutput(selected));
  const displayOutput = selected && selectedCompleted ? selected : ancestor ?? selected;
  // While the selected child has no art yet, the shown base is read-only: its
  // draft belongs to another output and saving against the child is not_ready.
  const viewingBaseOnly = !selectedCompleted && displayOutput !== selected;
  const displaySrc = displayOutput && hasUsableOutput(displayOutput)
    ? outputSource(displayOutput)
    : "";

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
              onClick={() => {
                if (layersOpen) {
                  // The scanner panel has no editor session to flush — close
                  // it directly. Only a mounted editor needs the flush path.
                  if (readyLayers) requestLayersExit();
                  else setLayersOpen(false);
                  setPendingCompare(true);
                  return;
                }
                setCompareOpen((value) => !value);
              }}
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
            onClick={() => {
              if (layersOpen) {
                // Scanner panels close directly; a mounted editor flushes.
                if (readyLayers) requestLayersExit();
                else setLayersOpen(false);
                return;
              }
              setCompareOpen(false);
              setLayersOpen(true);
            }}
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
                onClick={() => {
                  // Flush first; the selection only lands after success.
                  void switchTo(output.id);
                }}
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
                exitRequestToken={layersExitToken}
                onOpenChange={closeLayers}
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
          ) : displaySrc ? (
            <PieceReviewCanvas
              key={displaySrc}
              src={displaySrc}
              alt={t("pieceAlt", { label: `${versionLabel} · ${selected.targetFormat}` })}
              annotations={viewingBaseOnly
                ? displayOutput?.reviewDraft?.annotations ?? []
                : review.draft.annotations}
              onChange={(annotations) => review.update({ annotations })}
              readOnly={viewingBaseOnly}
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
          key={selected.id}
          presentation="workspace"
          output={selected}
          label={versionLabel}
          hidePreview
          retryCreditCost={composer.revisionCreditCost}
          onRetry={composer.retryOutput}
          onRetryThroughReview={retryThroughReview}
          onApprove={composer.approveOutput}
          onDownload={composer.downloadOutput}
          isRetrying={composer.isRetryingOutput?.(selected.id)}
          isApproving={composer.isApprovingOutput?.(selected.id)}
          approvalError={composer.approvalErrorOutputId === selected.id}
        />

        {resumeContext && resumeContext.parentId === selected.id ? (
          <button
            type="button"
            onClick={() => {
              review.update({
                action: resumeContext.from.action,
                targetFormat: resumeContext.from.targetFormat,
                instruction: resumeContext.from.instruction,
                revisionAssetId: resumeContext.from.revisionAssetId,
                annotations: resumeContext.from.annotations,
              });
              setResumeContext(null);
            }}
            className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {t("resumePreviousInstructions")}
          </button>
        ) : null}
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
              <div className="flex min-w-0 max-w-full flex-none flex-wrap items-center gap-2">
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <label className="flex flex-wrap items-center gap-2">
                {t("optionalAttachment")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={review.referencePending || reviewed}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void review.attachReference(file);
                  }}
                  className="min-w-0 max-w-full"
                />
              </label>
              {review.draft.revisionAssetId ? (
                <>
                  <span>{t("referenceAttached")}</span>
                  <button
                    type="button"
                    disabled={review.referencePending || reviewed}
                    onClick={() => review.update({ revisionAssetId: null })}
                    className="min-h-[var(--control-touch)] rounded-[var(--radius-control)] px-2 text-[var(--danger-text)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    {t("referenceRemove")}
                  </button>
                </>
              ) : null}
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

        {reviewed ? (
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
