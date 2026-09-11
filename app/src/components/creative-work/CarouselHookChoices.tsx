"use client";

import { useState, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw } from "lucide-react";
import type { CarouselHook } from "@/server/creative-work/carousel-editorial-state";

function hookListSyncKey(hooks: CarouselHook[], revision?: string | null): string {
  return `${revision ?? ""}\n${hooks.map((hook) => `${hook.id}\0${hook.headline}`).join("\n")}`;
}

export function CarouselHookChoices({
  hooks,
  recommendedHookId,
  recommendation,
  revision = null,
  busy,
  headingRef,
  onSelect,
  onRegenerate,
}: {
  hooks: CarouselHook[];
  recommendedHookId: string | null;
  recommendation: string | null;
  revision?: string | null;
  busy: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  onSelect: (hookId: string, headline?: string) => void;
  onRegenerate: () => void;
}) {
  const t = useTranslations("dashboard.home.composer.carousel");
  const listKey = hookListSyncKey(hooks, revision);
  const [syncedKey, setSyncedKey] = useState(listKey);
  const [headlines, setHeadlines] = useState<Record<string, string>>(() =>
    Object.fromEntries(hooks.map((hook) => [hook.id, hook.headline])),
  );
  if (syncedKey !== listKey) {
    setSyncedKey(listKey);
    setHeadlines(Object.fromEntries(hooks.map((hook) => [hook.id, hook.headline])));
  }

  return (
    <section
      aria-labelledby="carousel-hooks-title"
      data-testid="carousel-hook-choices"
      className="space-y-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="carousel-hooks-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-[var(--text-primary)] focus-visible:outline-none">
            {t("hooksTitle")}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{t("hooksHint")}</p>
        </div>
        <button
          type="button"
          data-testid="carousel-regenerate-hooks"
          disabled={busy}
          onClick={onRegenerate}
          className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <RefreshCw size={16} aria-hidden="true" />}
          {t("regenerateHooks")}
        </button>
      </div>

      {recommendation ? (
        <p data-testid="carousel-hook-recommendation" className="rounded-[var(--radius-control)] border border-[var(--info-border)] bg-[var(--info-bg)] px-3 py-2 text-sm text-[var(--info-text)]">
          <span className="font-semibold">{t("hookRecommendation")}: </span>
          {recommendation}
        </p>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-3">
        {hooks.map((hook) => {
          const recommended = hook.id === recommendedHookId;
          const headline = headlines[hook.id] ?? hook.headline;
          return (
            <li
              key={hook.id}
              data-testid={`carousel-hook-${hook.id}`}
              className="flex flex-col rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
            >
              {recommended ? (
                <span className="mb-2 w-fit rounded-full bg-[var(--selection-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                  {t("recommendedBadge")}
                </span>
              ) : null}
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                {t("hookHeadlineLabel")}
                <input
                  aria-label={`${t("hookHeadlineLabel")} — ${hook.headline}`}
                  value={headline}
                  disabled={busy}
                  onChange={(event) => setHeadlines((current) => ({ ...current, [hook.id]: event.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
                />
              </label>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{t("hookPromise")}: </span>
                {hook.promise}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{t("hookNarrative")}: </span>
                {hook.narrative}
              </p>
              <button
                type="button"
                disabled={busy || !headline.trim()}
                onClick={() => {
                  const next = headline.trim();
                  onSelect(hook.id, next !== hook.headline ? next : undefined);
                }}
                className="mt-4 inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("chooseHook")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
