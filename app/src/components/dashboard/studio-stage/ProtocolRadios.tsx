"use client";

import { useTranslations } from "next-intl";
import type { ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import { SHINE_COLORS } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";
import { discreetRadioClass } from "./DiscreetRadios";
import { studioSwitcherClass } from "./StudioInstrument";

const PROTOCOLS: ComposerIntent[] = [
  "variations",
  "single",
  "format_adaptation",
  "restyle",
];

const CAROUSEL: ComposerIntent = "carousel";

export const protocolShineFill = {
  backgroundImage: `linear-gradient(90deg, ${SHINE_COLORS.join(", ")})`,
} as const;

export function protocolRadioClass(checked: boolean) {
  return cn(
    discreetRadioClass(false),
    "inline-flex shrink-0 items-center whitespace-nowrap",
    checked && "text-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a]",
  );
}

export function ProtocolRadios({
  selected,
  suggested = null,
  onSelect,
  carouselEnabled = false,
}: {
  selected: ComposerIntent;
  suggested?: ComposerIntent | null;
  onSelect: (intent: ComposerIntent) => void;
  carouselEnabled?: boolean;
}) {
  const t = useTranslations("dashboard.home.tools");
  const protocols = carouselEnabled || selected === CAROUSEL
    ? [...PROTOCOLS, CAROUSEL]
    : PROTOCOLS;

  return (
    <section aria-labelledby="creative-tools-title">
      <h2 id="creative-tools-title" className="sr-only">{t("title")}</h2>
      <div
        role="radiogroup"
        aria-labelledby="creative-tools-title"
        className={studioSwitcherClass}
      >
        {protocols.map((id) => {
          const checked = selected === id;
          const creationDisabled = id === CAROUSEL && !carouselEnabled;
          const isSuggested = suggested === id && !checked;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={creationDisabled}
              onClick={() => onSelect(id)}
              className={protocolRadioClass(checked)}
              style={checked ? protocolShineFill : undefined}
            >
              <span>{t(id)}</span>
              {isSuggested ? (
                <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">{t("suggestedFromHistory")}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
