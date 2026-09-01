"use client";

import { useTranslations } from "next-intl";
import { labelEntryValue } from "@/lib/studio/entry-catalog";
import type { EntryChip, EntryLocale, EntrySlot } from "@/lib/studio/entry-types";
import { cn } from "@/lib/utils";

const SLOT_LABEL_KEYS: Record<EntrySlot, "slotProtocol" | "slotOffer" | "slotAudience" | "slotTone"> = {
  protocol: "slotProtocol",
  offer: "slotOffer",
  audience: "slotAudience",
  tone: "slotTone",
};

export function StudioEntryInterview({
  chips,
  answers,
  onSelect,
  locale,
  writtenToken = 0,
}: {
  chips: EntryChip[];
  answers: Partial<Record<EntrySlot, string>>;
  onSelect: (slot: EntrySlot, value: string) => void;
  locale: EntryLocale;
  writtenToken?: number;
}) {
  const t = useTranslations("dashboard.home.entryInterview");

  if (chips.length === 0) return null;

  return (
    <div data-testid="studio-entry-interview" className="space-y-3">
      {chips.map((chip) => (
        <div key={chip.slot} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t(SLOT_LABEL_KEYS[chip.slot])}
          </p>
          <div className="flex flex-wrap gap-2">
            {chip.options.map((option) => {
              const selected = answers[chip.slot] === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(chip.slot, option)}
                  className={cn(
                    "rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                    selected
                      ? "border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)]"
                      : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] hover:bg-[var(--surface-inset)]",
                  )}
                >
                  {labelEntryValue(chip.slot, option, locale)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {writtenToken > 0 ? (
        <p role="status" aria-live="polite" className="sr-only">
          {t("requestUpdated")}
        </p>
      ) : null}
    </div>
  );
}
