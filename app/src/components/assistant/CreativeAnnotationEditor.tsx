"use client";

import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AssistantGoalPresentation } from "@/lib/assistant/goal";

export interface CreativeAnnotationEditorProps {
  imageUrl: string;
  versionId: string;
  annotations: AssistantGoalPresentation["annotations"];
  onAdd: (annotation: {
    x: number;
    y: number;
    width: number;
    height: number;
    comment: string;
  }) => void;
  onRemove: (annotationId: string) => void;
  /** When true (mobile), renders the list + comment input but disables drawing. */
  isMobile?: boolean;
}

interface DraftRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Desktop rectangle annotation editor. The user draws rectangles with pointer
 * events over the source image; coordinates are stored normalized to [0,1]
 * against the rendered image bounds so they survive resize. A comment is
 * required before a rectangle is committed. On mobile, drawing is disabled and
 * the editor renders the annotation list + comment input with an explanatory
 * label (the pilot does not support freehand drawing on touch).
 */
export default function CreativeAnnotationEditor({
  imageUrl,
  annotations,
  onAdd,
  onRemove,
  isMobile = false,
}: CreativeAnnotationEditorProps) {
  const t = useTranslations("assistant.goal");
  const overlayRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const [comment, setComment] = useState("");
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const toNormalized = (clientX: number, clientY: number) => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1),
      y: Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    event.preventDefault();
    startRef.current = toNormalized(event.clientX, event.clientY);
    setDraft({ ...startRef.current, width: 0, height: 0 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMobile || !startRef.current) return;
    const end = toNormalized(event.clientX, event.clientY);
    const start = startRef.current;
    setDraft({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    });
  };

  const handlePointerUp = () => {
    if (isMobile || !draft || !startRef.current) return;
    // Reject rectangles smaller than 1% of image width or height.
    if (draft.width < 0.01 || draft.height < 0.01) {
      setDraft(null);
      startRef.current = null;
      return;
    }
    startRef.current = null;
    // Keep the draft mounted so the user can enter a comment before saving.
  };

  const handleSave = () => {
    const trimmed = comment.trim();
    if (!draft || !trimmed) return;
    onAdd({ ...draft, comment: trimmed });
    setDraft(null);
    setComment("");
  };

  const handleCancel = () => {
    setDraft(null);
    setComment("");
  };

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLLIElement>,
    annotationId: string
  ) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onRemove(annotationId);
    }
  };

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="assistant-annotation-editor"
    >
      <div className="relative w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="block w-full select-none rounded-lg border border-[var(--border-dim)]"
          data-testid="assistant-annotation-image"
          draggable={false}
        />
        {isMobile ? (
          <div
            data-testid="assistant-annotation-mobile-notice"
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-[var(--surface-base)]/70 p-4 text-center text-xs text-[var(--text-muted)]"
          >
            {t("annotationDrawingDisabled")}
          </div>
        ) : (
          <div
            ref={overlayRef}
            data-testid="assistant-annotation-overlay"
            className="absolute inset-0 cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {draft ? (
              <div
                className="absolute border-2 border-[var(--selection-border)] bg-[var(--selection-bg)]"
                style={{
                  left: `${draft.x * 100}%`,
                  top: `${draft.y * 100}%`,
                  width: `${draft.width * 100}%`,
                  height: `${draft.height * 100}%`,
                }}
              />
            ) : null}
            {annotations
              .filter((a) => a.status !== "addressed")
              .map((annotation, index) => (
                <div
                  key={annotation.id}
                  className="absolute border-2 border-[var(--danger-border)]"
                  style={{
                    left: `${annotation.x * 100}%`,
                    top: `${annotation.y * 100}%`,
                    width: `${annotation.width * 100}%`,
                    height: `${annotation.height * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-[var(--danger-bg)] px-1 text-xs text-[var(--danger-text)]">
                    {index + 1}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {draft ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--selection-border)] bg-[var(--surface-raised)] p-3">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            {t("annotationComment")}
          </label>
          <textarea
            data-testid="assistant-annotation-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            className="block w-full resize-none rounded-md border border-[var(--border-dim)] bg-[var(--surface-inset)] px-2 py-1 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            placeholder={t("annotationCommentPlaceholder")}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-testid="assistant-annotation-cancel"
              onClick={handleCancel}
              className="rounded-md border border-[var(--border-dim)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              data-testid="assistant-annotation-save"
              onClick={handleSave}
              disabled={!comment.trim()}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium",
                comment.trim()
                  ? "bg-[var(--action-primary-bg)] text-[var(--action-primary-text)]"
                  : "cursor-not-allowed bg-[var(--surface-inset)] text-[var(--text-muted)]"
              )}
            >
              {t("save")}
            </button>
          </div>
        </div>
      ) : null}

      {annotations.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {annotations.map((annotation, index) => (
            <li
              key={annotation.id}
              data-testid={`assistant-annotation-item-${annotation.id}`}
              tabIndex={0}
              onKeyDown={(event) => handleItemKeyDown(event, annotation.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-secondary)]",
                annotation.status === "addressed" && "opacity-60"
              )}
            >
              <span>
                <span className="font-medium text-[var(--danger-text)]">{index + 1}.</span>{" "}
                {annotation.comment}
                {annotation.status === "addressed"
                  ? ` · ${t("addressed")}`
                  : ""}
              </span>
              {annotation.status !== "addressed" ? (
                <button
                  type="button"
                  onClick={() => onRemove(annotation.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"
                  aria-label={t("removeAnnotation")}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
