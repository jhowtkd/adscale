"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SettingsV6Card, SettingsV6Labels } from "./settings-v6-types";

type SettingsV6ViewProps = {
  labels: SettingsV6Labels;
  cards: SettingsV6Card[];
  activeCardId?: string | null;
  interactive?: boolean;
  panel?: ReactNode;
};

export default function SettingsV6View({
  labels,
  cards,
  activeCardId,
  interactive = true,
  panel,
}: SettingsV6ViewProps) {
  const enabledCards = cards.filter((card) => card.enabled || card.id === activeCardId);
  const activeId = activeCardId && cards.some((card) => card.id === activeCardId)
    ? activeCardId
    : enabledCards[0]?.id ?? cards[0]?.id ?? "";
  const activeCard = cards.find((card) => card.id === activeId) ?? null;

  return (
    <div className="w-full py-0 pb-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {labels.sectionLabel}
        </h1>
        {labels.subtitle ? (
          <p className="text-sm text-[var(--text-muted)]">{labels.subtitle}</p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        <nav aria-label={labels.sectionLabel} data-testid="settings-nav" className="flex flex-col gap-0.5 lg:sticky lg:top-4">
          {cards.map((card) => {
            const current = card.id === activeId;
            const className = cn(
              "flex min-h-9 items-center rounded-md px-3 text-sm",
              current
                ? "bg-white/8 font-medium text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-white/6 hover:text-[var(--text-primary)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              !card.enabled && "cursor-default text-[var(--text-secondary)]",
            );

            if (interactive && card.enabled) {
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  aria-current={current ? "page" : undefined}
                  className={className}
                >
                  {card.title}
                </Link>
              );
            }

            return (
              <span key={card.id} className={className} aria-disabled="true">
                {card.title}
                {!card.enabled ? (
                  <span className="ml-auto text-xs font-normal text-[var(--text-secondary)]">
                    {card.badge}
                  </span>
                ) : null}
              </span>
            );
          })}
        </nav>

        <section className="min-w-0 space-y-6">
          {activeCard ? (
            <header className="space-y-1">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">{activeCard.title}</h2>
              <p className="text-sm text-[var(--text-muted)]">{activeCard.description}</p>
            </header>
          ) : null}
          {panel}
        </section>
      </div>
    </div>
  );
}
