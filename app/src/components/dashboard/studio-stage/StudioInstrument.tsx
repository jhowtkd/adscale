import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const studioPrimaryActionClass =
  "inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60";

export const studioQuietActionClass =
  "inline-flex min-h-8 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-white/6 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

/** Quiet TalkBox interview slots: nowrap text, not occupancy pills. */
export const studioQuietChoiceRowClass =
  "flex min-w-0 flex-nowrap items-baseline gap-x-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function studioQuietChoiceClass(checked: boolean) {
  return cn(
    "shrink-0 py-0.5 text-[11px] font-medium leading-none",
    checked
      ? "text-[var(--text-primary)]"
      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  );
}

/** Compact TalkBox attach language for Palco chrome next to the bell. */
export const studioChipClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 text-xs font-medium text-[var(--text-secondary)] hover:bg-white/12 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export const studioInstrumentClass =
  "w-full space-y-6 py-6";

/** Palco-aligned chrome row: eyebrow left, chips right, next to the bell. */
export const studioChromeBarClass =
  "relative z-20 flex items-center justify-between gap-3 md:-mt-4";

export const studioSearchClass =
  "w-full rounded-[var(--radius-control)] border-0 bg-white/6 py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

/** One Palco occupancy strip: search, radios, and count share a single chip. */
export const studioFilterStripClass =
  "flex h-9 min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-white/15 bg-white/[0.04] pl-3 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** TalkBox protocol switcher: hug content, selected pill only — no outer stroke. */
export const studioSwitcherClass =
  "-ml-3 inline-flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Image-led bento: columns hug each asset box instead of equal cards. */
export const studioBentoClass =
  "mt-4 columns-2 lg:columns-3 xl:columns-4 [column-gap:0.5rem]";

export const studioBentoItemClass = "mb-2 break-inside-avoid";

export function StudioInstrumentHeader({
  label,
  title,
  description,
  actions,
  className,
}: {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {label}
        </p>
        <h1 className="product-page-title text-[var(--text-primary)]">{title}</h1>
        {description ? (
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
