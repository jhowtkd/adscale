"use client";

// The empty state of Biblioteca, Criações, Ideias and Metas in the pilot (B2): an icon tile, what will appear here,
// and the fixed starters of the screen, which lead to the conversation with the phrase already sent.

import { useTranslations } from "next-intl";
import { LayoutGrid, Library, Lightbulb, SquareCheckBig, type LucideIcon } from "lucide-react";
import { defaultEquipeAccountId, useEquipeAccounts } from "@/lib/equipe/use-equipe";
import type { EMPTY_SCREEN_SUGGESTIONS } from "@/lib/equipe/suggestions";
import EquipeEmptySuggestions from "./EquipeEmptySuggestions";

const ICONS: Record<keyof typeof EMPTY_SCREEN_SUGGESTIONS, LucideIcon> = {
  creations: LayoutGrid,
  library: Library,
  ideas: Lightbulb,
  goals: SquareCheckBig,
};

export default function EquipeEmptyScreen({ surface }: { surface: keyof typeof EMPTY_SCREEN_SUGGESTIONS }) {
  const t = useTranslations("equipe.emptyScreens");
  const accounts = useEquipeAccounts().data?.accounts ?? [];
  const account = accounts.find((entry) => entry.id === defaultEquipeAccountId(accounts));
  const Icon = ICONS[surface];
  return (
    <section
      aria-labelledby={`empty-${surface}-title`}
      data-testid="equipe-empty-screen"
      data-surface={surface}
      className="flex flex-col items-center gap-6 px-4 py-16 text-center"
    >
      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="mb-2 grid size-[52px] place-items-center rounded-xl bg-[var(--surface-raised)] text-[var(--text-secondary)]">
          <Icon size={22} />
        </span>
        <h2 id={`empty-${surface}-title`} className="text-lg font-semibold text-[var(--text-primary)]">
          {t(`${surface}.title`)}
        </h2>
        <p className="max-w-[420px] text-sm text-[var(--text-secondary)]">
          {t(`${surface}.description`, { brand: account?.clientProfileName?.trim() || t("brandFallback") })}
        </p>
      </div>
      <EquipeEmptySuggestions surface={surface} />
    </section>
  );
}
