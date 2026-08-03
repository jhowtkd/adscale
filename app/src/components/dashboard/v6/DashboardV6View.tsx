"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { AnimatedDisplayValue } from "@/components/animations/AnimatedDisplayValue";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import type { DashboardV6Labels, DashboardV6ViewModel } from "./dashboard-v6-types";

type DashboardV6ViewProps = {
  view: DashboardV6ViewModel;
  labels: DashboardV6Labels;
  summary: ReactNode;
  isLoading?: boolean;
  interactive?: boolean;
};

export default function DashboardV6View({
  view,
  labels,
  summary,
  isLoading = false,
  interactive = true,
}: DashboardV6ViewProps) {
  const reducedMotion = useReducedMotion();
  const pulseClass = reducedMotion ? "" : "animate-pulse";
  const pulseDotClass = reducedMotion ? "" : "animate-pulse-dot";

  return (
    <div className="space-y-8" aria-busy={isLoading}>
      <header className="space-y-2" data-tour-step="1">
        <h1 className="product-page-title text-[var(--text-primary)]">
          {isLoading ? (
            <span className={cn("inline-block h-8 w-64 rounded bg-[var(--surface-raised)]", pulseClass)} />
          ) : (
            labels.greeting.replace("{firstName}", view.firstName)
          )}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {isLoading ? (
            <span className={cn("inline-block h-4 w-80 rounded bg-[var(--surface-raised)]", pulseClass)} />
          ) : (
            summary
          )}
        </p>
      </header>

      <section aria-label={labels.kpisAria}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <li
                  key={`kpi-skeleton-${index}`}
                  className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5"
                >
                  <KpiSkeleton pulseClass={pulseClass} />
                </li>
              ))
            : view.kpis.map((kpi, index) => (
                <li
                  key={kpi.label}
                  className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5"
                  {...(index === 3 ? { "data-tour-step": "5" } : {})}
                >
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--neutral-dot)]" />
                    {kpi.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                    <AnimatedDisplayValue value={kpi.value} />
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    {kpi.trendDir === "up" ? (
                      <TrendingUp size={12} className="text-[var(--success-text)]" aria-hidden="true" />
                    ) : null}
                    {kpi.trendDir === "down" ? (
                      <TrendingDown size={12} className="text-[var(--danger-text)]" aria-hidden="true" />
                    ) : null}
                    {kpi.trend}
                  </div>
                </li>
              ))}
        </ul>
      </section>

      {isLoading ? (
        <HeroSkeleton pulseClass={pulseClass} />
      ) : view.hero ? (
        <section
          className="relative overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 sm:p-8"
          aria-label={labels.heroProduction}
          data-tour-step="2"
        >
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
            <div className="flex-1 space-y-4">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-primary-text)]">
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full bg-[var(--neutral-dot)]", pulseDotClass)} />
                {labels.heroProduction} · {view.hero.badge}
              </span>
              <h2 className="product-page-title text-[var(--text-primary)]">{view.hero.name}</h2>
              <p className="max-w-xl text-sm text-[var(--text-secondary)]">{view.hero.description}</p>
              <div className="flex flex-wrap gap-3">
                <ActionLink
                  interactive={interactive}
                  href={`/campaigns/${view.hero.id}`}
                  className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-primary-hover)]"
                >
                  {labels.openCampaign}
                </ActionLink>
                <ActionLink
                  interactive={interactive}
                  href={`/campaigns/${view.hero.id}?tab=brief`}
                  className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)]"
                >
                  {labels.viewBriefing}
                </ActionLink>
              </div>
            </div>
            <dl className="min-w-[220px] space-y-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <MetaRow
                label={labels.metaBriefing}
                value={view.hero.briefingProgress != null ? `● ${view.hero.briefingProgress}%` : "—"}
                accent
              />
              <MetaRow
                label={labels.metaVariations}
                value={`${view.hero.variationsDone} / ${view.hero.variationsTotal}`}
              />
              <MetaRow label={labels.metaApproved} value={String(view.hero.approved)} accent />
              <MetaRow label={labels.metaCredits} value={String(view.hero.credits)} />
            </dl>
          </div>
        </section>
      ) : null}

      <ActivitySection
        view={view}
        labels={labels}
        isLoading={isLoading}
        interactive={interactive}
        pulseClass={pulseClass}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section
          className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-6"
          data-tour-step="4"
        >
          <h2 className="product-section-title text-[var(--text-primary)]">{labels.recipesTitle}</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{labels.recipesSubtitle}</p>
          {isLoading ? (
            <ul className="mt-4 space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className={cn("h-14 rounded-[var(--radius-control)] bg-[var(--surface-raised)]", pulseClass)} />
              ))}
            </ul>
          ) : view.recipes.length > 0 ? (
            <>
              <ul className="mt-4 space-y-2.5">
                {view.recipes.map((recipe) => (
                  <li key={recipe.id}>
                    <ActionLink
                      interactive={interactive}
                      href={recipe.href}
                      className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-[var(--border-default)]"
                    >
                      <span
                        className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary-subtle)] text-sm"
                        aria-hidden="true"
                      >
                        {recipe.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{recipe.name}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">{recipe.desc}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                        {recipe.count}
                      </span>
                    </ActionLink>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Link
                  href="/templates"
                  className="text-sm text-[var(--accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-sm"
                >
                  {labels.templatesLink}
                </Link>
              </div>
            </>
          ) : (
            <SectionEmpty
              title={labels.recipesEmptyTitle}
              description={labels.recipesEmptyDescription}
              actionLabel={labels.recipesEmptyAction}
              actionHref="/templates"
              interactive={interactive}
              className="mt-4"
            />
          )}
        </section>

        <section className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-6">
          <h2 className="product-section-title text-[var(--text-primary)]">{labels.briefingTitle}</h2>
          {isLoading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn("h-8 rounded bg-[var(--surface-raised)]", pulseClass)} />
              ))}
            </div>
          ) : view.briefingRows.length > 0 ? (
            <>
              <dl className="mt-4 divide-y divide-[var(--border-subtle)]">
                {view.briefingRows.map((row) => (
                  <div key={row.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{row.key}</dt>
                    <dd className="max-w-[60%] text-right text-sm text-[var(--text-primary)]">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex gap-2 border-t border-[var(--border-subtle)] pt-4">
                <ActionLink
                  interactive={interactive}
                  href={view.activeBriefingCampaignId ? `/campaigns/${view.activeBriefingCampaignId}?tab=brief` : "/templates"}
                  className="flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 text-center text-sm font-medium text-[var(--text-primary)]"
                >
                  {labels.editBriefing}
                </ActionLink>
                <ActionLink
                  interactive={interactive}
                  href={view.activeBriefingCampaignId ? `/campaigns/${view.activeBriefingCampaignId}` : "/campaigns?new=1"}
                  className="flex-1 rounded-[var(--radius-control)] bg-[var(--accent-primary)] py-2 text-center text-sm font-medium text-[var(--text-on-accent)]"
                >
                  {labels.goToActions}
                </ActionLink>
              </div>
            </>
          ) : (
            <SectionEmpty
              title={labels.briefingEmptyTitle}
              description={labels.briefingEmptyDescription}
              actionLabel={labels.briefingEmptyAction}
              actionHref="/campaigns?new=1"
              interactive={interactive}
              className="mt-4"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ActionLink({
  interactive,
  href,
  className,
  children,
}: {
  interactive: boolean;
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (!interactive) {
    return (
      <button
        type="button"
        className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
      >
        {children}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
    >
      {children}
    </Link>
  );
}

function SectionEmpty({
  title,
  description,
  actionLabel,
  actionHref,
  interactive,
  className = "p-6",
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  interactive: boolean;
  className?: string;
}) {
  return (
    <div className={`${className} space-y-3`}>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      <ActionLink
        interactive={interactive}
        href={actionHref}
        className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-primary-hover)]"
      >
        {actionLabel}
      </ActionLink>
    </div>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className={`text-sm font-medium ${accent ? "text-[var(--accent-primary-text)]" : "text-[var(--text-primary)]"}`}>
        <AnimatedDisplayValue value={value} />
      </dd>
    </div>
  );
}

function ActivitySection({
  view,
  labels,
  isLoading,
  interactive,
  pulseClass = "animate-pulse",
}: {
  view: DashboardV6ViewModel;
  labels: DashboardV6Labels;
  isLoading: boolean;
  interactive: boolean;
  pulseClass?: string;
}) {
  return (
    <section aria-label={labels.activityTitle} data-tour-step="3">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="product-section-title text-[var(--text-primary)]">{labels.activityTitle}</h2>
          <p className="text-xs text-[var(--text-secondary)]">{labels.activitySubtitle}</p>
        </div>
        <ActionLink
          interactive={interactive}
          href="/campaigns"
          className="text-xs font-medium text-[var(--accent-primary-text)]"
        >
          {labels.viewAll}
        </ActionLink>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        {isLoading ? (
          <div className={cn("h-48 bg-[var(--surface-raised)]", pulseClass)} />
        ) : view.activity.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {labels.tableCampaign}
                </th>
                <th scope="col" className="px-4 py-3">
                  {labels.tableStatus}
                </th>
                <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                  {labels.tablePlatform}
                </th>
                <th scope="col" className="px-4 py-3">
                  {labels.tableVariations}
                </th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">
                  {labels.tableUpdated}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {view.activity.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--surface-raised)]">
                  <td className="px-4 py-3">
                    {interactive ? (
                      <Link
                        href={row.href}
                        className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-sm"
                      >
                        <ActivityRowContent row={row} />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">
                        <ActivityRowContent row={row} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill variant={row.statusClass} label={row.status} />
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--text-secondary)] sm:table-cell">{row.platforms}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{row.variations}</td>
                  <td className="hidden px-4 py-3 text-xs text-[var(--text-secondary)] md:table-cell">{row.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <SectionEmpty
            title={labels.activityEmptyTitle}
            description={labels.activityEmptyDescription}
            actionLabel={labels.activityEmptyAction}
            actionHref="/campaigns?new=1"
            interactive={interactive}
          />
        )}
      </div>
    </section>
  );
}

function ActivityRowContent({ row }: { row: DashboardV6ViewModel["activity"][number] }) {
  return (
    <>
      <span
        className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] bg-[var(--surface-raised)] text-base"
        aria-hidden="true"
      >
        {row.thumb}
      </span>
      <div>
        <div className="font-medium text-[var(--text-primary)]">{row.name}</div>
        <div className="text-xs text-[var(--text-muted)]">{row.subtitle}</div>
      </div>
    </>
  );
}

function StatusPill({ variant, label }: { variant: string; label: string }) {
  const styles: Record<string, string> = {
    running: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    review: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    approved: "bg-[var(--success-bg)] text-[var(--success-text)]",
    draft: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  const dotColor: Record<string, string> = {
    running: "bg-[var(--warning-dot)]",
    review: "bg-[var(--warning-dot)]",
    approved: "bg-[var(--success-dot)]",
    draft: "bg-[var(--neutral-dot)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant] ?? styles.draft}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor[variant] ?? dotColor.draft}`} />
      {label}
    </span>
  );
}

function KpiSkeleton({ pulseClass = "animate-pulse" }: { pulseClass?: string }) {
  return (
    <>
      <div className={cn("h-3 w-20 rounded bg-[var(--surface-raised)]", pulseClass)} />
      <div className={cn("mt-2 h-7 w-16 rounded bg-[var(--surface-raised)]", pulseClass)} />
      <div className={cn("mt-1 h-3 w-24 rounded bg-[var(--surface-raised)]", pulseClass)} />
    </>
  );
}

function HeroSkeleton({ pulseClass = "animate-pulse" }: { pulseClass?: string }) {
  return (
    <div
      className={cn(
        "h-48 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]",
        pulseClass
      )}
    />
  );
}
