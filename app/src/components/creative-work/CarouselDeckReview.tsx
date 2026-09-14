"use client";

import type { Ref } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import type { PublicCarouselQualityV1, PublicCarouselSlide } from "@/lib/hooks/use-creative-work";
import { getArtRefinementPresentation } from "@/lib/creative-work-selection-policy";
import type { CreativeResultCardArtRefinement } from "./CreativeResultCard";

/**
 * Deck review surface: current slide status/version per position, objective
 * failures, advisory set warnings, individual download, the single explicit
 * approval and the ordered ZIP export (enabled only after approval).
 */
export function CarouselDeckReview({
  slides,
  quality,
  deckRevision,
  approvedRevision,
  canApprove,
  canExport,
  isBusy,
  headingRef,
  onApprove,
  onDownloadSlide,
  onExport,
  onRetrySlide,
  coverReview = false,
  canApproveCover = false,
  interiorsQuote = null,
  onApproveCoverAndGenerate,
  artRefinement = null,
}: {
  slides: PublicCarouselSlide[];
  quality: PublicCarouselQualityV1 | null;
  deckRevision: string | null;
  approvedRevision: string | null;
  canApprove: boolean;
  canExport: boolean;
  isBusy: boolean;
  /** Lets the wizard move focus to the review heading when the phase changes. */
  headingRef?: Ref<HTMLHeadingElement>;
  onApprove: () => void;
  onDownloadSlide: (slideId: string) => void;
  onExport: () => void;
  onRetrySlide: (slideId: string) => void;
  coverReview?: boolean;
  canApproveCover?: boolean;
  interiorsQuote?: { unitCount: number; credits: number } | null;
  onApproveCoverAndGenerate?: () => void;
  /** Work-level automatic-refinement summary (plan 04, T4); absent on legacy works. */
  artRefinement?: CreativeResultCardArtRefinement;
}) {
  const t = useTranslations("dashboard.home.composer.carousel");
  const approved = Boolean(deckRevision && approvedRevision === deckRevision);
  // Deck-level refinement state is work-scoped: no single output id applies.
  const refinement = getArtRefinementPresentation(null, artRefinement);

  return (
    <section
      aria-labelledby="carousel-review-title"
      data-testid="carousel-deck-review"
      className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <h2 ref={headingRef} id="carousel-review-title" tabIndex={-1} className="text-base font-semibold text-[var(--text-primary)] focus-visible:outline-none">
        {coverReview ? t("coverReviewTitle") : t("reviewTitle")}
      </h2>

      {quality ? (
        quality.objectivePassed ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("objectivePassed")}</p>
        ) : (
          <p role="alert" data-testid="carousel-objective-failed" className="mt-2 text-sm font-medium text-[var(--danger-text)]">
            {t("objectiveFailed")}
          </p>
        )
      ) : null}

      {quality && quality.advisoryWarnings.length > 0 ? (
        <div className="mt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("advisoryWarningsLabel")}</h3>
          <ul data-testid="carousel-advisory-warnings" className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
            {quality.advisoryWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {refinement.status === "running" && refinement.issues[0] ? (
        <p role="status" data-testid="carousel-refinement-running" className="mt-2 text-sm text-[var(--text-secondary)]">
          {t("refinementRunning", { issue: refinement.issues[0] })}
        </p>
      ) : null}

      {refinement.status && refinement.status !== "running" && refinement.issues.length > 0 ? (
        <div className="mt-2">
          <p data-testid="carousel-refinement-best" className="text-xs font-medium text-[var(--text-secondary)]">
            {t("refinementBestDeck")}
          </p>
          <ul data-testid="carousel-refinement-issues" className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--text-muted)]">
            {refinement.issues.map((issue) => (
              <li key={issue}>{t("refinementPending", { issue })}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {slides.map((slide) => (
          <li
            key={slide.id}
            data-testid={`carousel-review-slide-${slide.position}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">
                {t("slideLabel", { position: slide.position })}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                {t(`status_${slide.status}`)} · {t("versionLabel", { version: slide.versionNumber })}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {slide.status === "failed" ? (
                <button
                  type="button"
                  data-testid={`carousel-review-retry-${slide.position}`}
                  onClick={() => onRetrySlide(slide.id)}
                  disabled={isBusy}
                  className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("retryAction")}
                </button>
              ) : null}
              {slide.status === "completed" && slide.hasOutput ? (
                <button
                  type="button"
                  data-testid={`carousel-download-${slide.position}`}
                  onClick={() => onDownloadSlide(slide.id)}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <Download size={12} aria-hidden="true" />
                  {t("downloadSlide")}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
        {coverReview && onApproveCoverAndGenerate ? (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              data-testid="carousel-approve-cover"
              onClick={onApproveCoverAndGenerate}
              disabled={!canApproveCover || isBusy}
              className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("approveCoverAndGenerate")}
            </button>
            {interiorsQuote ? (
              <p data-testid="carousel-interiors-budget" className="text-xs text-[var(--text-muted)]">
                {t("interiorsBudget", { count: interiorsQuote.unitCount, credits: interiorsQuote.credits })}
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            data-testid="carousel-approve"
            onClick={onApprove}
            disabled={!canApprove || isBusy}
            className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("approveAction")}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {approved ? <span className="text-xs font-medium text-[var(--text-secondary)]">{t("approved")}</span> : <span className="text-xs text-[var(--text-muted)]">{t("exportRequiresApproval")}</span>}
          <button
            type="button"
            data-testid="carousel-export"
            onClick={onExport}
            disabled={!canExport || isBusy}
            className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("exportAction")}
          </button>
        </div>
      </div>
    </section>
  );
}
