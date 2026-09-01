"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, Columns2, CopyPlus, Image, Maximize, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerIntent } from "./useCreativeComposer";

const TOOLS = [
  { id: "variations", icon: CopyPlus },
  { id: "single", icon: Image },
  { id: "format_adaptation", icon: Maximize },
  { id: "restyle", icon: WandSparkles },
] as const;

const CAROUSEL_TOOL = { id: "carousel", icon: Columns2 } as const;

const FOCUS_TARGETS: Record<ComposerIntent, string> = {
  single: "creative-composer-request",
  variations: "creative-composer-dropzone",
  format_adaptation: "creative-composer-dropzone",
  restyle: "creative-composer-original-source",
  carousel: "creative-composer-request",
};

export function CreativeToolCards({ selected, suggested = null, onSelect, headerAction, carouselEnabled = false }: {
  selected: ComposerIntent | null;
  suggested?: ComposerIntent | null;
  onSelect: (intent: ComposerIntent) => void | boolean | Promise<void | boolean>;
  headerAction?: ReactNode;
  /** Task 10 wires the carousel rollout percentage; false hides new creation. */
  carouselEnabled?: boolean;
}) {
  const t = useTranslations("dashboard.home.tools");
  const tools = carouselEnabled ? [...TOOLS, CAROUSEL_TOOL] : [...TOOLS, ...(selected === "carousel" ? [CAROUSEL_TOOL] : [])];
  return (
    <section aria-labelledby="creative-tools-title">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="creative-tools-title" className="text-sm font-semibold text-[var(--text-primary)]">
          {t("title")}
        </h2>
        {headerAction}
      </div>
      <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", carouselEnabled ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4")}>
        {tools.map(({ id, icon: Icon }) => {
          const creationDisabled = id === "carousel" && !carouselEnabled;
          const isSuggested = suggested === id && selected !== id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected === id}
              disabled={creationDisabled}
              onClick={() => {
                void Promise.resolve(onSelect(id)).then((selectedIntent) => {
                  if (selectedIntent === false) return;
                  requestAnimationFrame(() => document.getElementById(FOCUS_TARGETS[id])?.focus());
                });
              }}
              className={cn(
                "group flex min-h-28 w-full flex-col rounded-[var(--radius-object)] border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                "disabled:cursor-not-allowed disabled:opacity-70",
                selected === id
                  ? "border-[var(--selection-border)] bg-[var(--selection-bg)] ring-1 ring-inset ring-[var(--selection-border)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]",
              )}
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] border",
                    selected === id
                      ? "border-[var(--selection-border)] bg-[var(--surface-base)] text-[var(--selection-text)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--utility-icon)]",
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                {selected === id ? (
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--selection-text)] text-[var(--surface-base)]">
                    <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                ) : null}
              </span>
              <span className="mt-4 block text-sm font-semibold text-[var(--text-primary)]">{t(id)}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{t(`${id}Description`)}</span>
              {isSuggested ? (
                <span className="mt-2 block text-xs leading-5 text-[var(--text-muted)]">{t("suggestedFromHistory")}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
