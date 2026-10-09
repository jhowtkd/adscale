import { cn } from "@/lib/utils";
import { settingsButtonClass } from "@/components/settings/settings-chrome";

/** Chat commit: Config quiet, never Palco ivory. */
export const assistantQuietCommitClass = settingsButtonClass;

export const assistantIconSendClass = cn(
  "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]",
  "hover:bg-white/8",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

/**
 * The rail conversation's bottom row (v4): the pill composer sits in this gutter, on this column. Whatever takes the
 * input's place (the read-only footer of a closed account) uses the same two, so it lines up with the conversation.
 */
export const railChatGutterClass = "px-4 pb-3 pt-2 md:pb-8";
export const railChatColumnClass = "mx-auto w-full max-w-[680px]";
