"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type {
  CarouselCopyAuthority,
  CarouselEditorialChangeV1,
  CarouselLayoutFamily,
  CarouselNarrativeRole,
  CarouselSlideStatus,
  CarouselStructureFinding,
} from "@/server/creative-work/carousel-contracts";
import type { CarouselEditableField } from "./useCarouselComposer";
import { CAROUSEL_NARRATIVE_ROLES } from "@/server/creative-work/carousel-contracts";
import type { SlideDirection } from "@/server/creative-work/carousel-editorial-state";

export type CarouselEditorSlide = {
  id: string;
  position: number;
  role: CarouselNarrativeRole;
  purpose: string;
  primaryText: string;
  secondaryText: string | null;
  layoutFamily: CarouselLayoutFamily;
  status: CarouselSlideStatus;
  copyAuthority: CarouselCopyAuthority;
  versionNumber: number | null;
  hasOutput: boolean;
  errorCode: string | null;
};

const DENSITY_BY_LAYOUT: Record<CarouselLayoutFamily, "high" | "medium" | "low"> = {
  impact: "high",
  development: "medium",
  respite: "low",
};

/**
 * Per-slide editor. The textareas are always bound to the slide's CURRENT
 * accepted copy: a pending AI suggestion renders as a separate before/after
 * proposal and never replaces the textarea value until it is accepted — a
 * human-edited slide keeps its text even with suggestions waiting.
 */
export function CarouselSlideEditor({
  slide,
  pendingChanges,
  findings,
  canEditDraft,
  isBusy,
  onEdit,
  onAcceptChange,
  onRejectChange,
  onCopyRevision,
  onVisualRevision,
  onRetry,
  direction = null,
}: {
  slide: CarouselEditorSlide | null;
  pendingChanges: CarouselEditorialChangeV1[];
  findings: CarouselStructureFinding[];
  canEditDraft: boolean;
  isBusy: boolean;
  direction?: SlideDirection | null;
  onEdit: (slideId: string, field: CarouselEditableField, value: string) => void;
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onCopyRevision: (slideId: string, primaryText: string, secondaryText: string | null) => void;
  onVisualRevision: (slideId: string, instruction: string) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("dashboard.home.composer.carousel");
  const primaryAreaRef = useRef<HTMLTextAreaElement>(null);
  const [visualInstruction, setVisualInstruction] = useState("");
  const [draftText, setDraftText] = useState({
    primary: slide?.primaryText ?? "",
    secondary: slide?.secondaryText ?? "",
  });
  const [syncedSlide, setSyncedSlide] = useState<{
    id: string;
    primaryText: string;
    secondaryText: string | null;
  } | null>(slide ? { id: slide.id, primaryText: slide.primaryText, secondaryText: slide.secondaryText } : null);

  // Render-phase adjustment: the textareas always mirror the slide's CURRENT
  // accepted copy. A pending AI suggestion lives in `pendingChanges` and never
  // touches `slide.primaryText`, so it can never replace the textarea value
  // until it is accepted.
  if (slide && (!syncedSlide || syncedSlide.id !== slide.id || syncedSlide.primaryText !== slide.primaryText || syncedSlide.secondaryText !== slide.secondaryText)) {
    setSyncedSlide({ id: slide.id, primaryText: slide.primaryText, secondaryText: slide.secondaryText });
    setDraftText({ primary: slide.primaryText, secondary: slide.secondaryText ?? "" });
  }

  if (!slide) return null;

  const planning = slide.status === "draft";
  const failed = slide.status === "failed";
  const completed = slide.status === "completed";

  return (
    <section
      aria-label={t("editorTitle", { position: slide.position })}
      data-testid="carousel-slide-editor"
      className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("slideLabel", { position: slide.position })}
        </h3>
        <span data-testid="carousel-slide-authority" className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          {t("authorityLabel")}: {t(`authority_${slide.copyAuthority}`)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[var(--text-secondary)]">
          {t("roleLabel")}
          <select
            aria-label={t("roleLabel")}
            value={slide.role}
            disabled={!canEditDraft || isBusy}
            onChange={(event) => onEdit(slide.id, "role", event.target.value)}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
          >
            {CAROUSEL_NARRATIVE_ROLES.map((role) => (
              <option key={role} value={role}>{t(`role_${role}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--text-secondary)]">
          {t("purposeLabel")}
          <input
            aria-label={t("purposeLabel")}
            value={slide.purpose}
            disabled={!canEditDraft || isBusy}
            onChange={(event) => onEdit(slide.id, "purpose", event.target.value)}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
          />
        </label>
        <label className="text-sm text-[var(--text-secondary)] sm:col-span-2">
          {t("primaryTextLabel")}
          <textarea
            ref={primaryAreaRef}
            aria-label={t("primaryTextLabel")}
            value={draftText.primary}
            disabled={!canEditDraft || isBusy}
            rows={2}
            onChange={(event) => {
              setDraftText((current) => ({ ...current, primary: event.target.value }));
              onEdit(slide.id, "primaryText", event.target.value);
            }}
            className="mt-1 w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
          />
        </label>
        <label className="text-sm text-[var(--text-secondary)] sm:col-span-2">
          {t("secondaryTextLabel")}
          <textarea
            aria-label={t("secondaryTextLabel")}
            value={draftText.secondary}
            disabled={!canEditDraft || isBusy}
            rows={2}
            onChange={(event) => {
              setDraftText((current) => ({ ...current, secondary: event.target.value }));
              onEdit(slide.id, "secondaryText", event.target.value);
            }}
            className="mt-1 w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        <span data-testid="carousel-slide-density">
          {t("layoutFamilyLabel")}: {t(`layout_${slide.layoutFamily}`)} · {t("densityLabel")}:{" "}
          {t(`density_${DENSITY_BY_LAYOUT[slide.layoutFamily]}`)}
        </span>
        <span>
          {t("statusLabel")}: {t(`status_${slide.status}`)}
          {slide.versionNumber ? ` · v${slide.versionNumber}` : ""}
        </span>
      </div>

      {direction ? (
        <dl data-testid="carousel-slide-direction" className="mt-3 grid gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-secondary)]">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("visualLearning")}</dt>
            <dd className="mt-0.5">{direction.learning}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("visualRepresentation")}</dt>
            <dd className="mt-0.5">{direction.representation}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("visualHierarchy")}</dt>
            <dd className="mt-0.5">{direction.hierarchy}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t("visualTransition")}</dt>
            <dd className="mt-0.5">{direction.transition}</dd>
          </div>
        </dl>
      ) : null}

      {slide.copyAuthority === "human_edit" ? (
        <p data-testid="carousel-slide-human-edit" className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
          {t("humanEditNote")}
        </p>
      ) : null}

      {findings.length > 0 ? (
        <div data-testid="carousel-slide-findings" className="mt-3 space-y-1">
          {findings.map((finding) => (
            <p key={`${finding.path}:${finding.code}`} role="alert" className="text-xs font-medium text-[var(--danger-text)]">
              {finding.message}
            </p>
          ))}
        </div>
      ) : null}

      {pendingChanges.map((change) => (
        <article
          key={change.id}
          data-testid={`carousel-suggestion-${change.id}`}
          className="mt-3 rounded-[var(--radius-control)] border border-[var(--info-border)] bg-[var(--info-bg)] p-3"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--info-text)]">{t("suggestionTitle")}</h4>
          <dl className="mt-2 grid gap-1 text-xs text-[var(--text-secondary)]">
            <div>
              <dt className="font-medium text-[var(--text-primary)]">{t("suggestionBefore")}</dt>
              <dd>{change.before ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--text-primary)]">{t("suggestionAfter")}</dt>
              <dd>{change.after ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--text-primary)]">{t("suggestionReason")}</dt>
              <dd>{change.reason}</dd>
            </div>
          </dl>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAcceptChange(change.id)}
              disabled={!canEditDraft || isBusy}
              className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("acceptChange")}
            </button>
            <button
              type="button"
              onClick={() => onRejectChange(change.id)}
              disabled={!canEditDraft || isBusy}
              className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("rejectChange")}
            </button>
            <button
              type="button"
              onClick={() => primaryAreaRef.current?.focus()}
              className="rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {t("editInstead")}
            </button>
          </div>
        </article>
      ))}

      {failed ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-xs font-medium text-[var(--danger-text)]">{t("failedNote")}</p>
          <button
            type="button"
            data-testid="carousel-editor-retry"
            onClick={onRetry}
            disabled={isBusy}
            className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("retryAction")}
          </button>
        </div>
      ) : null}

      {completed && !planning ? (
        <div className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <button
            type="button"
            data-testid="carousel-copy-revision"
            onClick={() => onCopyRevision(slide.id, draftText.primary, draftText.secondary.trim() || null)}
            disabled={isBusy}
            className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("copyOnlyAction")}
          </button>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
              <span className="sr-only">{t("visualInstructionLabel")}</span>
              <input
                aria-label={t("visualInstructionLabel")}
                value={visualInstruction}
                onChange={(event) => setVisualInstruction(event.target.value)}
                className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </label>
            <button
              type="button"
              data-testid="carousel-visual-revision"
              onClick={() => onVisualRevision(slide.id, visualInstruction.trim())}
              disabled={isBusy || !visualInstruction.trim()}
              className={cn(
                "inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]",
                "hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {t("visualRefetchAction")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
