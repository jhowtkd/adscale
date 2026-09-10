"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { containedImageBounds, imagePoint, type PieceImageBounds } from "./piece-review-geometry";

export type PieceReviewAnnotation = { id: string; x: number; y: number; text: string };

type AnnotationDraft = PieceReviewAnnotation & { isNew: boolean };

/**
 * Piece image with comment pins. Coordinates are normalized against the
 * rendered image (letterboxing excluded) through piece-review-geometry; the
 * full container is only a fallback while the natural size is unknown.
 * Nothing here generates, uploads or charges — onChange only edits the draft.
 */
export function PieceReviewCanvas({
  src,
  alt,
  annotations,
  onChange,
}: {
  src: string;
  alt: string;
  annotations: PieceReviewAnnotation[];
  onChange: (annotations: PieceReviewAnnotation[]) => void;
}) {
  const t = useTranslations("dashboard.home.composer.results");
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const commentToggleRef = useRef<HTMLButtonElement>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [bounds, setBounds] = useState<PieceImageBounds | null>(null);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;
    const rect = container.getBoundingClientRect();
    const box: PieceImageBounds = { left: 0, top: 0, width: rect.width, height: rect.height };
    setBounds(
      img.naturalWidth > 0 && img.naturalHeight > 0
        ? containedImageBounds(box, img.naturalWidth, img.naturalHeight)
        : rect.width > 0 && rect.height > 0 ? box : null,
    );
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function" && containerRef.current) {
      observer = new ResizeObserver(() => measure());
      observer.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    if (!draft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setDraft(null);
      commentToggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft]);

  const hasNaturalSize = Boolean(imgRef.current?.naturalWidth && imgRef.current.naturalHeight);

  const startDraftFromClick = (event: React.MouseEvent) => {
    if (!commentMode || draft) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const box = hasNaturalSize && bounds ? bounds : { left: 0, top: 0, width: rect.width, height: rect.height };
    const point = imagePoint(box, event.clientX - rect.left, event.clientY - rect.top);
    if (!point) return;
    setDraft({ id: crypto.randomUUID(), x: point.x, y: point.y, text: "", isNew: true });
  };

  const saveDraft = () => {
    if (!draft || !draft.text.trim()) return;
    const saved: PieceReviewAnnotation = {
      id: draft.id,
      x: draft.x,
      y: draft.y,
      text: draft.text.trim(),
    };
    onChange(
      draft.isNew
        ? [...annotations, saved]
        : annotations.map((annotation) => (annotation.id === draft.id ? saved : annotation)),
    );
    setDraft(null);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center gap-2">
      <div
        ref={containerRef}
        className="relative flex min-h-0 w-full flex-1 items-center justify-center"
        onMouseDown={startDraftFromClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={measure}
          className="max-h-full max-w-full object-contain"
        />
        <div
          style={bounds
            ? {
                position: "absolute",
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height,
                pointerEvents: "none",
              }
            : { position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {annotations.map((annotation, index) => (
            <button
              key={annotation.id}
              type="button"
              aria-label={t("commentPinName", { count: index + 1 })}
              title={annotation.text}
              onClick={(event) => {
                event.stopPropagation();
                setDraft({ ...annotation, isNew: false });
              }}
              style={{
                position: "absolute",
                left: `${annotation.x * 100}%`,
                top: `${annotation.y * 100}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "auto",
              }}
              className="grid size-7 place-items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-overlay)] text-xs font-semibold text-[var(--text-primary)] shadow-[var(--shadow-floating)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={commentToggleRef}
          type="button"
          aria-pressed={commentMode}
          onClick={() => setCommentMode((value) => !value)}
          className="inline-flex min-h-[var(--control-touch)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {t("commentMode")}
        </button>
        <button
          type="button"
          disabled={!commentMode}
          onClick={() => setDraft({ id: crypto.randomUUID(), x: 0.5, y: 0.5, text: "", isNew: true })}
          className="inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {t("commentAdd")}
        </button>
      </div>

      {draft ? (
        <form
          className="w-full max-w-md space-y-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft();
          }}
        >
          <label className="block text-sm font-medium text-[var(--text-primary)]">
            {t("commentText")}
            <textarea
              aria-label={t("commentText")}
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 font-normal"
            />
          </label>
          <div className="flex gap-2">
            <label className="text-xs text-[var(--text-secondary)]">
              {t("commentX")}
              <input
                aria-label={t("commentX")}
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(draft.x * 100)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setDraft({ ...draft, x: Math.min(Math.max(next, 0), 100) / 100 });
                }}
                className="ml-1 w-20 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1"
              />
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              {t("commentY")}
              <input
                aria-label={t("commentY")}
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(draft.y * 100)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setDraft({ ...draft, y: Math.min(Math.max(next, 0), 100) / 100 });
                }}
                className="ml-1 w-20 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!draft.text.trim()}
              className="inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-semibold text-[var(--action-primary-text)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {t("commentSave")}
            </button>
            {!draft.isNew ? (
              <button
                type="button"
                onClick={() => {
                  onChange(annotations.filter((annotation) => annotation.id !== draft.id));
                  setDraft(null);
                }}
                className="inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {t("commentRemove")}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
