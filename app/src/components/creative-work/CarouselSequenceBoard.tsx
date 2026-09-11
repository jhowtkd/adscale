"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CarouselNarrativeRole, CarouselSlideStatus } from "@/server/creative-work/carousel-contracts";

export type CarouselBoardSlide = {
  id: string;
  position: number;
  role: CarouselNarrativeRole;
  status: CarouselSlideStatus | null;
  primaryText?: string | null;
  visualDirection?: string | null;
};

/**
 * Ordered, all-visible sequence board. Every slide stays on screen through a
 * horizontally scrollable strip on narrow viewports; order and status never
 * hide. Reordering happens through native HTML5 drag/drop or the explicit
 * per-card movement buttons — keyboard focus follows the moved slide.
 */
export function CarouselSequenceBoard({
  slides,
  selectedSlideId,
  canEdit,
  minSlides = 5,
  maxSlides = 8,
  onSelect,
  onMove,
  onAdd,
  onRemove,
}: {
  slides: CarouselBoardSlide[];
  selectedSlideId: string | null;
  canEdit: boolean;
  minSlides?: number;
  maxSlides?: number;
  onSelect: (slideId: string) => void;
  onMove: (slideId: string, toPosition: number) => void;
  onAdd: () => void;
  onRemove: (slideId: string) => void;
}) {
  const t = useTranslations("dashboard.home.composer.carousel");
  const selectRefs = useRef(new Map<string, HTMLButtonElement>());
  const draggedSlideIdRef = useRef<string | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const id = pendingFocusRef.current;
    pendingFocusRef.current = null;
    selectRefs.current.get(id)?.focus();
  }, [slides]);

  const move = (slideId: string, toPosition: number) => {
    pendingFocusRef.current = slideId;
    onMove(slideId, toPosition);
  };

  const lastPosition = slides.length;

  return (
    <section aria-label={t("boardAria")}>
      <div
        data-testid="carousel-board-scroll"
        className="overflow-x-auto pb-2 [scrollbar-width:thin]"
      >
        <ol className="flex min-w-max snap-x snap-mandatory gap-3 lg:grid lg:min-w-0 lg:grid-cols-4 xl:grid-cols-5">
          {slides.map((slide) => {
            const selected = slide.id === selectedSlideId;
            return (
              <li
                key={slide.id}
                data-testid={`carousel-slide-card-${slide.position}`}
                draggable={canEdit}
                onDragStart={(event) => {
                  draggedSlideIdRef.current = slide.id;
                  event.dataTransfer.setData("text/plain", slide.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (!canEdit) return;
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = event.dataTransfer.getData("text/plain") || draggedSlideIdRef.current;
                  draggedSlideIdRef.current = null;
                  if (canEdit && draggedId && draggedId !== slide.id) {
                    move(draggedId, slide.position);
                  }
                }}
                className={cn(
                  "group relative flex w-64 shrink-0 snap-start flex-col rounded-[var(--radius-object)] border p-3 transition-colors",
                  selected
                    ? "border-[var(--selection-border)] bg-[var(--selection-bg)] ring-1 ring-inset ring-[var(--selection-border)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    ref={(element) => {
                      if (element) selectRefs.current.set(slide.id, element);
                      else selectRefs.current.delete(slide.id);
                    }}
                    type="button"
                    data-testid={`carousel-slide-${slide.position}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(slide.id)}
                    className="min-w-0 flex-1 rounded-[var(--radius-control)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {t("slideLabel", { position: slide.position })}
                      </span>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">{t(`role_${slide.role}`)}</span>
                    </span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">
                      {t(`status_${slide.status ?? "draft"}`)}
                    </span>
                    {slide.primaryText ? (
                      <span className="mt-2 block text-sm leading-snug text-[var(--text-primary)]">
                        {slide.primaryText}
                      </span>
                    ) : null}
                    {slide.visualDirection ? (
                      <span className="mt-1 block text-xs leading-snug text-[var(--text-secondary)]">
                        {slide.visualDirection}
                      </span>
                    ) : null}
                  </button>
                  <button
                      type="button"
                      data-testid={`carousel-remove-${slide.position}`}
                      aria-label={t("removeSlideAria", { position: slide.position })}
                      disabled={!canEdit || slides.length <= minSlides}
                      onClick={() => onRemove(slide.id)}
                      className="rounded-[var(--radius-control)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                </div>
                <div className="mt-3 flex items-center gap-1 border-t border-[var(--border-subtle)] pt-2">
                    <button
                      type="button"
                      data-testid={`carousel-move-up-${slide.position}`}
                      aria-label={t("moveUp")}
                      title={t("moveUp")}
                      onClick={() => move(slide.id, slide.position - 1)}
                      disabled={!canEdit || slide.position === 1}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-testid={`carousel-move-down-${slide.position}`}
                      aria-label={t("moveDown")}
                      title={t("moveDown")}
                      onClick={() => move(slide.id, slide.position + 1)}
                      disabled={!canEdit || slide.position === lastPosition}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                  </div>
              </li>
            );
          })}
          <li className="flex w-64 shrink-0 snap-start items-center justify-center lg:w-auto">
              <button
                type="button"
                data-testid="carousel-add-slide"
                onClick={onAdd}
                disabled={!canEdit || slides.length >= maxSlides}
                className="flex min-h-20 w-full items-center justify-center gap-2 rounded-[var(--radius-object)] border border-dashed border-[var(--border-default)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} aria-hidden="true" />
                {t("addSlide")}
              </button>
            </li>
        </ol>
      </div>
    </section>
  );
}
