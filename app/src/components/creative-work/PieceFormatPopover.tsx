"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CreativeWorkFormat } from "@/server/creative-work/contracts";

const DEFAULT_FORMATS: readonly CreativeWorkFormat[] = ["1:1", "4:5", "9:16"];

/**
 * Format proportions anchored to the trigger button through the native
 * popover API (top layer, so the box never clips it). Opening, closing or
 * Escape never changes the review draft — only onChoose/onCancel do.
 */
export function PieceFormatPopover({
  value,
  formats = DEFAULT_FORMATS,
  onChoose,
  onCancel,
  disabled = false,
}: {
  value: CreativeWorkFormat | null;
  /** Offered options (ICE-04B): 3:4 appears only with the creation capability. */
  formats?: readonly CreativeWorkFormat[];
  onChoose: (format: CreativeWorkFormat) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("dashboard.home.composer.results");
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // jsdom and older browsers apply the popover UA stylesheet without the API;
  // those need a manual display toggle on top of the native attribute.
  const [nativePopover, setNativePopover] = useState(true);
  useEffect(() => {
    setNativePopover(typeof panelRef.current?.showPopover === "function");
  }, []);

  const positionPanel = useCallback(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 10;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fitsAbove = triggerRect.top - panelRect.height - gap >= margin;
    const top = fitsAbove
      ? triggerRect.top - panelRect.height - gap
      : triggerRect.bottom + gap;
    const maxHeight = fitsAbove
      ? viewportHeight
      : Math.max(viewportHeight - top - margin, 120);
    const left = Math.min(
      Math.max(triggerRect.left, margin),
      Math.max(viewportWidth - panelRect.width - margin, margin),
    );
    panel.style.top = `${Math.max(top, margin)}px`;
    panel.style.left = `${left}px`;
    panel.style.maxHeight = `${Math.max(Math.min(maxHeight, viewportHeight - margin), 120)}px`;
  }, []);

  const closePanel = useCallback(() => {
    const panel = panelRef.current;
    if (panel && typeof panel.hidePopover === "function") {
      panel.hidePopover();
      return;
    }
    // No popover support (old browsers): plain state toggle.
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, positionPanel]);

  // Native light dismiss (Escape/outside click) reports back through toggle.
  const handleToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
    const nextOpen = event.newState === "open";
    setOpen(nextOpen);
    if (!nextOpen) triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={panelId}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        className="inline-flex min-h-[var(--control-touch)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        onClick={() => {
          // popoverTarget already toggles natively; only environments without
          // the popover API need the manual state fallback.
          const panel = panelRef.current;
          if (!panel || typeof panel.showPopover !== "function") setOpen((current) => !current);
        }}
      >
        {t("formatTrigger")}
      </button>
      <div
        id={panelId}
        ref={panelRef}
        popover="auto"
        role="dialog"
        aria-label={t("formatDialogLabel")}
        onToggle={handleToggle}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          closePanel();
        }}
        style={{ position: "fixed", margin: 0, display: nativePopover ? undefined : open ? "flex" : "none" }}
        className="z-[var(--layer-popover)] w-44 flex-col gap-1 overflow-y-auto rounded-[var(--radius-overlay)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1 shadow-[var(--shadow-floating)] [&:popover-open]:flex"
      >
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            aria-pressed={value === format}
            className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            onClick={() => {
              onChoose(format);
              closePanel();
            }}
          >
            <span
              aria-hidden="true"
              className="inline-block shrink-0 border border-current"
              style={{ display: "block", height: 30, aspectRatio: format.replace(":", " / ") }}
            />
            {format}
          </button>
        ))}
        {value !== null ? (
          <button
            type="button"
            className="flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            onClick={() => {
              onCancel();
              closePanel();
            }}
          >
            {t("cancelFormat")}
          </button>
        ) : null}
      </div>
    </>
  );
}
