import { cn } from "@/lib/utils";

export const legalKickerClass =
  "font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]";

export const legalNavClass = "mt-8 flex flex-wrap gap-x-5 gap-y-2";

export function legalNavLinkClass(active: boolean) {
  return cn(
    "font-mono text-[11px] uppercase tracking-[0.14em]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
    active
      ? "text-[var(--text-primary)]"
      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
  );
}

export const legalTitleClass = "product-page-title text-[var(--text-primary)]";

export const legalUpdatedClass = "mt-3 text-sm text-[var(--text-secondary)]";

export const legalMainClass = "mx-auto w-full max-w-3xl px-6 pb-24 pt-10 sm:px-10";

export const legalArticleClass =
  "mt-10 max-w-[68ch] space-y-8 text-sm leading-relaxed text-[var(--text-secondary)]";

export const legalSectionTitleClass =
  "text-base font-semibold tracking-tight text-[var(--text-primary)]";

export const legalInlineLinkClass = cn(
  "text-[var(--text-primary)] underline underline-offset-2 hover:no-underline",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
);
