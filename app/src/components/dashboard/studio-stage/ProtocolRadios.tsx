"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ComposerIntent } from "@/components/creative-work/useCreativeComposer";

const PROTOCOLS: ComposerIntent[] = [
  "variations",
  "single",
  "format_adaptation",
  "restyle",
];

const CAROUSEL: ComposerIntent = "carousel";
const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

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
      <div role="radiogroup" aria-labelledby="creative-tools-title" className="flex flex-wrap gap-1">
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
              className={cn(
                "min-h-8 rounded-full px-3 text-xs font-medium",
                checked
                  ? "bg-white/14 text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-white/6 hover:text-[var(--text-primary)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                focus,
              )}
            >
              <span>{t(id)}</span>
              {isSuggested ? (
                <span className="ml-1 text-[10px] text-[var(--text-muted)]">{t("suggestedFromHistory")}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
