"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CreditCard, Lock, Monitor, Package, Plug, User, Users, type LucideIcon } from "lucide-react";
import type { SettingsV6Card, SettingsV6Labels } from "./settings-v6-types";

const cardIcons: Record<string, LucideIcon> = {
  profile: User,
  workspace: Monitor,
  team: Users,
  billing: CreditCard,
  creditHistory: BarChart3,
  plans: Package,
  integrations: Plug,
  privacy: Lock,
};

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
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{labels.sectionLabel}</p>
        <h1 className="product-page-title text-[var(--text-primary)]">{labels.title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{labels.subtitle}</p>
      </header>

      <ul data-testid="settings-card-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const isActive = activeCardId === card.id;
          const Icon = cardIcons[card.id];
          const content = (
            <article
              className={`flex min-h-44 flex-col rounded-[var(--radius-object)] border p-5 text-left transition-colors ${
                isActive
                  ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                  : card.enabled
                    ? "border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-base)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-base)]"
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--neutral-bg)] text-[var(--utility-icon)]">
                {Icon ? <Icon size={18} strokeWidth={1.7} aria-hidden="true" /> : null}
              </span>
              <div className="mt-4 min-w-0 flex-1">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">{card.title}</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{card.description}</p>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <SettingsBadge variant={card.badgeVariant} label={card.badge} />
                <span className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)]">
                  {card.actionLabel}
                </span>
              </div>
            </article>
          );

          return (
            <li key={card.id}>
              {interactive && card.enabled ? (
                onSelectCard ? (
                  <button type="button" aria-current={isActive ? "page" : undefined} className="block h-full w-full rounded-[var(--radius-object)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => onSelectCard(card.id)}>
                    {content}
                  </button>
                ) : (
                  <Link href={card.href} aria-current={isActive ? "page" : undefined} className="block h-full rounded-[var(--radius-object)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
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
