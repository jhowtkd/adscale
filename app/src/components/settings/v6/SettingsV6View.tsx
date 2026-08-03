"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { SettingsV6Card, SettingsV6Labels } from "./settings-v6-types";

type SettingsV6ViewProps = {
  labels: SettingsV6Labels;
  cards: SettingsV6Card[];
  activeCardId?: string | null;
  interactive?: boolean;
  onSelectCard?: (id: string) => void;
  panel?: ReactNode;
};

export default function SettingsV6View({
  labels,
  cards,
  activeCardId,
  interactive = true,
  onSelectCard,
  panel,
}: SettingsV6ViewProps) {
  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{labels.sectionLabel}</p>
        <h1 className="product-page-title text-[var(--text-primary)]">{labels.title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{labels.subtitle}</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const isActive = activeCardId === card.id;
          const content = (
            <article
              className={`flex h-full flex-col gap-3 rounded-[var(--radius-object)] border p-5 transition-colors ${
                isActive
                  ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                  : card.enabled
                    ? "border-[var(--border-subtle)] bg-[var(--surface-base)] hover:border-[var(--border-default)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-base)] opacity-55"
              }`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-control)] bg-[var(--neutral-bg)] text-[var(--utility-icon)]">
                <span aria-hidden="true">{card.icon}</span>
              </span>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{card.title}</h2>
              <p className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{card.description}</p>
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                <SettingsBadge variant={card.badgeVariant} label={card.badge} />
                <span className="text-sm text-[var(--text-muted)]">
                  {card.enabled ? labels.openCard : labels.unavailable}
                </span>
              </div>
            </article>
          );

          return (
            <li key={card.id}>
              {interactive && card.enabled ? (
                onSelectCard ? (
                  <button type="button" className="block h-full w-full text-left" onClick={() => onSelectCard(card.id)}>
                    {content}
                  </button>
                ) : (
                  <Link href={card.href} className="block h-full">
                    {content}
                  </Link>
                )
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>

      {panel ? (
        <section className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-8">
          {panel}
        </section>
      ) : null}
    </div>
  );
}

function SettingsBadge({
  variant,
  label,
}: {
  variant: "success" | "warning" | "neutral";
  label: string;
}) {
  const styles = {
    success: "bg-[var(--success-bg)] text-[var(--success-text)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]}`}>{label}</span>;
}
