"use client";

import { useTranslations } from "next-intl";
import {
  studioQuietChoiceClass,
  studioQuietChoiceRowClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import { SHINE_COLORS } from "@/components/ui/shine-border";
import { labelEntryValue } from "@/lib/studio/entry-catalog";
import type { EntryChip, EntryLocale, EntrySlot } from "@/lib/studio/entry-types";

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

  const statusRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {writtenToken > 0 ? `${t("requestUpdated")} ${writtenToken}` : null}
    </p>
  );

  if (chips.length === 0) return statusRegion;

  return (
    <div data-testid="studio-entry-interview" className="space-y-2">
      <p
        className="bg-clip-text font-mono text-[10px] uppercase tracking-[0.14em] text-transparent"
        style={{ backgroundImage: `linear-gradient(90deg, ${SHINE_COLORS.join(", ")})` }}
      >
        {t("suggestionsEyebrow")}
      </p>
      {chips.map((chip) => {
        const slotLabel = t(SLOT_LABEL_KEYS[chip.slot]);
        return (
          <div key={chip.slot} className="flex min-w-0 items-baseline gap-3">
            <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {slotLabel}
            </p>
            <div
              role="radiogroup"
              aria-label={t("suggestionsGroup", { slot: slotLabel })}
              className={studioQuietChoiceRowClass}
            >
              {chip.options.map((option) => {
                const selected = answers[chip.slot] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelect(chip.slot, option)}
                    className={studioQuietChoiceClass(selected)}
                  >
                    {labelEntryValue(chip.slot, option, locale)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {statusRegion}
    </div>
  );
}
