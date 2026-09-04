import { cn } from "@/lib/utils";

export const settingsFieldClass = cn(
  "w-full h-10 rounded-md border border-[var(--border-dim)] px-3 text-sm",
  "bg-[var(--surface-base)] text-[var(--text-primary)]",
  "placeholder:text-[var(--text-muted)]",
  "focus:outline-none focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export const settingsTextareaClass = cn(
  settingsFieldClass,
  "h-auto min-h-[5.5rem] resize-y py-2",
);

export const settingsButtonClass = cn(
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)]",
  "hover:bg-white/8",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const settingsDangerButtonClass = cn(
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--danger-border)] bg-transparent px-4 text-sm font-medium text-[var(--danger-text)]",
  "hover:bg-[var(--danger-bg)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const settingsSectionClass = "space-y-4";

export const settingsSectionTitleClass = "text-sm font-medium text-[var(--text-primary)]";

export const settingsHintClass = "text-xs text-[var(--text-muted)]";

export const settingsRowClass =
  "flex items-center gap-4 border-b border-[var(--border-dim)] py-3 last:border-b-0";
