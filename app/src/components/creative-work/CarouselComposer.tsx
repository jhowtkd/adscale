"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ImagePlus, LayoutPanelTop, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { CarouselVisualContractV1, CarouselSlidePlanV1, CarouselEditorialChangeV1 } from "@/server/creative-work/carousel-contracts";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";
import { CarouselSequenceBoard, type CarouselBoardSlide } from "./CarouselSequenceBoard";
import { CarouselSlideEditor, type CarouselEditorSlide } from "./CarouselSlideEditor";
import { CarouselVisualSummary } from "./CarouselVisualSummary";
import { CarouselDeckReview } from "./CarouselDeckReview";
import type { CarouselComposerController } from "./useCarouselComposer";

function editorSlideFromPlan(slide: CarouselSlidePlanV1): CarouselEditorSlide {
  return {
    id: slide.slideId,
    position: slide.position,
    role: slide.role,
    purpose: slide.purpose,
    primaryText: slide.primaryText,
    secondaryText: slide.secondaryText,
    layoutFamily: slide.layoutFamily,
    status: "draft",
    copyAuthority: slide.authority,
    versionNumber: null,
    hasOutput: false,
    errorCode: null,
  };
}

function editorSlideFromPublic(slide: CarouselComposerController["slides"][number]): CarouselEditorSlide {
  return {
    id: slide.id,
    position: slide.position,
    role: slide.role,
    purpose: slide.primaryText,
    primaryText: slide.primaryText,
    secondaryText: slide.secondaryText,
    layoutFamily: slide.layoutFamily,
    status: slide.status,
    copyAuthority: slide.copyAuthority,
    versionNumber: slide.versionNumber,
    hasOutput: slide.hasOutput,
    errorCode: slide.errorCode,
  };
}

/**
 * Dedicated carousel wizard shell. The carousel controller arrives through
 * props (the generic progressive controller owns entry, preparation and
 * confirmation); this component only renders phases and delegates to the
 * presentational board/editor/summary/review surfaces.
 */
export function CarouselComposer({
  carousel,
  composerRef,
  request,
  onRequestChange,
  styleSource = null,
  styleUploadPending = false,
  onAddStyleFiles,
  onRetryStyleSource,
  onRemoveStyleSource,
  visualContract = null,
  approvedRevision = null,
  requestOwner = "self",
  resultsContainer = null,
  active = true,
}: {
  carousel: CarouselComposerController;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
  request: string;
  onRequestChange: (value: string) => void;
  styleSource?: CreativeWorkSource | null;
  styleUploadPending?: boolean;
  onAddStyleFiles: (files: FileList | File[]) => void;
  onRetryStyleSource?: () => void;
  onRemoveStyleSource?: () => void;
  visualContract?: CarouselVisualContractV1 | null;
  /** Approved deck revision, when the host surface already knows it. */
  approvedRevision?: string | null;
  requestOwner?: "self" | "host";
  resultsContainer?: HTMLElement | null;
  /** Auto-focus only. Never gates data or execution. */
  active?: boolean;
}) {
  const t = useTranslations("dashboard.home.composer.carousel");
  const styleInputRef = useRef<HTMLInputElement>(null);
  const firstQuestionRef = useRef<HTMLDivElement>(null);
  const sequenceHeadingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPhaseRef = useRef<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Review-level retry: selecting the failed slide first keeps the controller
  // contract (only the selected failed CURRENT slide retries, exactly once);
  // the tick forces the follow-up effect to run once selection lands.
  const [retryTick, setRetryTick] = useState(0);
  const pendingRetryRef = useRef<string | null>(null);

  const { draft, slides, phase, findings, isBusy } = carousel;
  // Mirrors the controller's internal editing gate: the draft is editable
  // while the sequence exists and no prepared revision has frozen it.
  const canEditDraft = phase === "sequence" && Boolean(draft?.plan) && !isBusy;
  const questions = draft?.blockingQuestions ?? [];
  const planSlides = draft?.plan?.slides ?? [];
  const generated = slides.length > 0;
  const completedCount = slides.filter((slide) => slide.status === "completed").length;
  const failedCount = slides.filter((slide) => slide.status === "failed").length;

  const boardSlides: CarouselBoardSlide[] = (generated
    ? slides.map((slide) => ({ id: slide.id, position: slide.position, role: slide.role, status: slide.status }))
    : planSlides.map((slide) => ({ id: slide.slideId, position: slide.position, role: slide.role, status: null })));

  const plannedSlide = planSlides.find((slide) => slide.slideId === carousel.selectedSlideId)
    ?? (planSlides[0] as CarouselSlidePlanV1 | undefined);
  const editorSlide = generated
    ? (slides.find((slide) => slide.id === carousel.selectedSlideId) ?? slides[0] ?? null)
    : null;
  const editorSlideModel = editorSlide
    ? editorSlideFromPublic(editorSlide)
    : plannedSlide
      ? editorSlideFromPlan(plannedSlide)
      : null;
  const editorSlideId = editorSlideModel?.id ?? null;
  const editorIndex = editorSlideModel ? editorSlideModel.position - 1 : -1;
  const editorFindings = editorIndex >= 0
    ? findings.filter((finding) => finding.path.startsWith(`slides.${editorIndex}.`))
    : [];
  const pendingChanges = (draft?.changes ?? []).filter(
    (change): change is CarouselEditorialChangeV1 => change.status === "pending" && change.slideId === editorSlideId,
  );

  useEffect(() => {
    if (phase === "entry") { previousPhaseRef.current = phase; return; }
    if (previousPhaseRef.current === phase) return;
    const target = phase === "review" ? reviewHeadingRef.current
      : active && phase === "questions" ? firstQuestionRef.current
      : active && (phase === "sequence" || phase === "ready_to_generate")
        ? sequenceHeadingRef.current : null;
    if (!target || target.closest("[inert]")) return;
    target.focus();
    previousPhaseRef.current = phase;
  }, [phase, active, resultsContainer]);

  const { selectedSlide, retrySlide } = carousel;

  useEffect(() => {
    const pending = pendingRetryRef.current;
    if (!pending) return;
    if (!selectedSlide || selectedSlide.id !== pending || selectedSlide.status !== "failed") return;
    pendingRetryRef.current = null;
    void retrySlide();
  }, [retryTick, selectedSlide, retrySlide]);

  const handleRetryFromReview = (slideId: string) => {
    pendingRetryRef.current = slideId;
    carousel.selectSlide(slideId);
    setRetryTick((tick) => tick + 1);
  };

  const sequenceContent = phase !== "entry" && phase !== "questions" ? (
        <section aria-labelledby="carousel-sequence-title" className="space-y-4">
          <h2
            id="carousel-sequence-title"
            ref={sequenceHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-[var(--text-primary)] focus-visible:outline-none"
          >
            {t("sequenceTitle")}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{t("sequenceHint")}</p>

          {findings.length > 0 ? (
            <div data-testid="carousel-findings" className="space-y-1 rounded-[var(--radius-control)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
              {findings.map((finding) => (
                <p key={`${finding.path}:${finding.code}`} role="alert" className="text-sm font-medium text-[var(--warning-text)]">
                  {finding.message}
                </p>
              ))}
            </div>
          ) : null}

          <CarouselSequenceBoard
            slides={boardSlides}
            selectedSlideId={editorSlideId}
            canEdit={canEditDraft}
            onSelect={carousel.selectSlide}
            onMove={(slideId, toPosition) => void carousel.moveSlide(slideId, toPosition)}
            onAdd={() => void carousel.addSlide()}
            onRemove={(slideId) => void carousel.removeSlide(slideId)}
          />

          <CarouselSlideEditor
            slide={editorSlideModel}
            pendingChanges={pendingChanges}
            findings={editorFindings}
            canEditDraft={canEditDraft}
            isBusy={isBusy}
            onEdit={(slideId, field, value) => void carousel.editSlide(slideId, field, value)}
            onAcceptChange={(changeId) => void carousel.acceptChange(changeId)}
            onRejectChange={(changeId) => void carousel.rejectChange(changeId)}
            onCopyRevision={(slideId, primaryText, secondaryText) =>
              void carousel.reviseSlide(slideId, { kind: "copy", primaryText, secondaryText })}
            onVisualRevision={(slideId, instruction) =>
              void carousel.reviseSlide(slideId, { kind: "visual", instruction })}
            onRetry={() => void carousel.retrySlide()}
          />

          <CarouselVisualSummary visualContract={visualContract} />

          {phase === "sequence" ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                data-testid="carousel-prepare"
                disabled={!carousel.canPrepare}
                onClick={() => void carousel.prepareCarousel()}
                className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("prepareAction")}
              </button>
            </div>
          ) : null}
          {phase === "ready_to_generate" ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                data-testid="carousel-generate"
                disabled={!carousel.canGenerate || isBusy}
                onKeyDown={(event) => {
                  // Enter never triggers generation; the single explicit
                  // confirmation is a pointer click on this button.
                  if (event.key === "Enter") event.preventDefault();
                }}
                onClick={() => void carousel.generateCarousel()}
                className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("generateAction")}
              </button>
            </div>
          ) : null}
        </section>
  ) : null;

  const reviewContent = (
    <>
      {phase === "generating" ? (
        <section aria-labelledby="carousel-generating-title" data-testid="carousel-generating" className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
          <h2 id="carousel-generating-title" className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <Loader2 size={16} aria-hidden="true" className="animate-spin" />
            {t("generatingTitle")}
          </h2>
        </section>
      ) : null}

      {phase === "review" || phase === "generating" ? (
        <>
          <p
            role="status"
            aria-live="polite"
            data-testid="carousel-progress"
            className="text-sm font-medium text-[var(--info-text)]"
          >
            {t("progressAnnouncement", { completed: completedCount, failed: failedCount, total: slides.length })}
          </p>
          {phase === "review" ? (
            <CarouselDeckReview
              headingRef={reviewHeadingRef}
              slides={slides}
              quality={carousel.quality}
              deckRevision={carousel.draft?.plan?.revision ?? carousel.slides[0]?.deckRevision ?? null}
              approvedRevision={approvedRevision}
              canApprove={carousel.canApprove}
              canExport={Boolean(
                approvedRevision
                && approvedRevision === (carousel.draft?.plan?.revision ?? carousel.slides[0]?.deckRevision ?? null)
                && slides.length > 0
                && slides.every((slide) => slide.status === "completed"),
              )}
              isBusy={isBusy}
              onApprove={() => void carousel.approveDeck()}
              onDownloadSlide={(slideId) => carousel.downloadSlide(slideId)}
              onExport={() => void carousel.exportDeck()}
              onRetrySlide={handleRetryFromReview}
            />
          ) : null}
        </>
      ) : null}
    </>
  );

  const hasResults = phase === "generating" || phase === "review";
  const resultContent = <>{sequenceContent}{reviewContent}</>;
  const renderedResults = hasResults && resultsContainer
    ? createPortal(resultContent, resultsContainer)
    : hasResults ? resultContent : null;

  return (
    <div data-testid="carousel-composer" className="space-y-5">
      {phase === "entry" ? (
        <section aria-label={t("title")} data-testid="carousel-entry" className="space-y-3">
          {requestOwner === "self" ? (
            <>
              <label htmlFor="creative-composer-request" className="sr-only">{t("requestLabel")}</label>
              <textarea
                ref={composerRef}
                id="creative-composer-request"
                aria-label={t("requestLabel")}
                value={request}
                onChange={(event) => onRequestChange(event.target.value)}
                placeholder={t("requestPlaceholder")}
                rows={4}
                className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={styleInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              tabIndex={-1}
              aria-label={t("addStyleReference")}
              className="sr-only"
              onChange={(event) => {
                if (event.target.files?.length) onAddStyleFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => styleInputRef.current?.click()}
              disabled={styleUploadPending || isBusy}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus size={16} aria-hidden="true" />
              {styleUploadPending ? t("uploadingStyle") : t("addStyleReference")}
            </button>
            <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{t("styleHint")}</span>
          </div>
          {styleSource ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Paperclip size={14} aria-hidden="true" />
                <span className="truncate">{styleSource.name}</span>
                <span className="text-xs text-[var(--text-muted)]">{t(`sourceStatus_${styleSource.status}`)}</span>
              </span>
              <span className="flex items-center gap-2">
                {styleSource.status === "failed" && onRetryStyleSource ? (
                  <button type="button" onClick={onRetryStyleSource} className="text-xs font-semibold text-[var(--text-secondary)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    {t("retryStyleSource")}
                  </button>
                ) : null}
                {onRemoveStyleSource ? (
                  <button
                    type="button"
                    aria-label={t("removeStyleSource")}
                    onClick={onRemoveStyleSource}
                    className="rounded-[var(--radius-control)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="carousel-organize"
              disabled={!request.trim() || isBusy}
              onClick={() => void carousel.askForPlan()}
              className="inline-flex min-h-[var(--control-touch)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <LayoutPanelTop size={16} aria-hidden="true" />}
              {isBusy ? t("organizing") : t("organizeContent")}
            </button>
          </div>
        </section>
      ) : null}

      {phase === "questions" ? (
        <section data-testid="carousel-questions" aria-label={t("questionsTitle")} className="space-y-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{t("questionsTitle")}</h2>
          {questions.map((question, index) => (
            <div
              key={question.id}
              ref={index === 0 ? firstQuestionRef : undefined}
              tabIndex={index === 0 ? -1 : undefined}
              data-testid={`carousel-question-${index}`}
              className="rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">{question.question}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{question.reason}</p>
              <input
                aria-label={question.question}
                value={answers[question.id] ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                className="mt-2 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </div>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="carousel-answer-submit"
              disabled={isBusy}
              onClick={() => void carousel.answerQuestions(answers)}
              className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("answerSubmit")}
            </button>
          </div>
        </section>
      ) : null}

      {!hasResults ? sequenceContent : null}
      {renderedResults}
    </div>
  );
}
