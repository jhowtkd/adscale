import { cn } from "@/lib/utils";

export const authFieldClass = cn(
  "min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 text-sm",
  "bg-[var(--surface-raised)] text-[var(--text-primary)]",
  "placeholder:text-[var(--text-muted)]",
  "focus-visible:border-[var(--neutral-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
);

export const authPrimaryButtonClass = cn(
  "inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)]",
  "hover:bg-white/8",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const authQuietButtonClass = cn(
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-transparent px-4 text-sm font-medium text-[var(--text-muted)]",
  "hover:bg-white/6 hover:text-[var(--text-primary)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const authTextLinkClass = cn(
  "font-medium text-[var(--text-primary)] underline underline-offset-2 hover:no-underline",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
);

export const authRowClass =
  "flex items-center justify-between gap-4 border-b border-[var(--border-dim)] py-3 last:border-b-0";
