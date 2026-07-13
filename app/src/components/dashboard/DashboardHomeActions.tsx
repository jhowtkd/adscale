"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, MessageSquare, Plus, Sparkles } from "lucide-react";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { resolveContinueWork } from "@/lib/dashboard/resolve-continue-work";
import { cn } from "@/lib/utils";

const INTENT_OPTIONS = [
  {
    id: "campaign" as const,
    href: "/campaigns?new=1",
    icon: Sparkles,
    titleKey: "intentCampaign" as const,
    descKey: "intentCampaignDesc" as const,
  },
  {
    id: "social_post" as const,
    href: "/quick-tools/create-post",
    icon: Plus,
    titleKey: "intentSocialPost" as const,
    descKey: "intentSocialPostDesc" as const,
  },
  {
    id: "assistant" as const,
    href: "/assistant",
    icon: MessageSquare,
    titleKey: "intentAssistant" as const,
    descKey: "intentAssistantDesc" as const,
  },
];

/**
 * Phase 6 / items 43–44: single home entry — new work (intent first) + continue.
 * Uses canonical works list (campaign + creative_work), not campaigns-only.
 */
export default function DashboardHomeActions() {
  const t = useTranslations("dashboard.home");
  const { data: works = [], isLoading, isError, refetch } = useCanonicalWorks();
  const [intentOpen, setIntentOpen] = useState(false);

  const continueTarget = useMemo(() => resolveContinueWork(works), [works]);
  const recent = useMemo(
    () => works.filter((w) => w.resumable).slice(0, 5),
    [works]
  );

  if (isError && works.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("errorTitle")}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">{t("errorDescription")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-4">
        <h1 className="sr-only">{t("title")}</h1>

        {!intentOpen ? (
          <button
            type="button"
            onClick={() => setIntentOpen(true)}
            className={cn(
              "flex w-full items-center justify-between gap-4 rounded-[var(--radius-object)] border border-[var(--border-default)]",
              "bg-[var(--accent-primary)] px-6 py-5 text-left transition-colors",
              "hover:bg-[var(--accent-primary-hover)]"
            )}
          >
            <span className="flex items-center gap-3">
              <Plus
                size={20}
                aria-hidden="true"
                className="text-[var(--text-on-accent)]"
              />
              <span className="text-base font-semibold text-[var(--text-on-accent)]">
                {t("newWork")}
              </span>
            </span>
            <ArrowRight
              size={18}
              aria-hidden="true"
              className="text-[var(--text-on-accent)] opacity-80"
            />
          </button>
        ) : (
          <section
            aria-labelledby="home-intent-heading"
            className="space-y-2 rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h2
                id="home-intent-heading"
                className="text-sm font-semibold text-[var(--text-primary)]"
              >
                {t("chooseIntent")}
              </h2>
              <button
                type="button"
                onClick={() => setIntentOpen(false)}
                className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {t("intentBack")}
              </button>
            </div>
            {INTENT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <Link
                  key={opt.id}
                  href={opt.href}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)]",
                    "bg-[var(--surface-base)] px-4 py-3 text-left transition-colors",
                    "hover:bg-[var(--surface-inset)]"
                  )}
                >
                  <Icon
                    size={18}
                    className="mt-0.5 shrink-0 text-[var(--accent-primary-text)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">
                      {t(opt.titleKey)}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      {t(opt.descKey)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>
        )}

        {isLoading && works.length === 0 ? (
          <div
            className="h-[4.5rem] w-full animate-pulse rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
            aria-hidden="true"
          />
        ) : continueTarget.kind === "work" ? (
          <Link
            href={continueTarget.href}
            className={cn(
              "flex w-full flex-col gap-1 rounded-[var(--radius-object)] border border-[var(--border-default)]",
              "bg-[var(--surface-raised)] px-6 py-5 text-left transition-colors",
              "hover:bg-[var(--surface-inset)]"
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-[var(--text-primary)]">
                {t("continueWhereLeftOff")}
              </span>
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="text-[var(--text-muted)]"
              />
            </span>
            <span className="truncate text-sm text-[var(--text-secondary)]">
              {t("continueCampaignHint", { name: continueTarget.name })}
            </span>
          </Link>
        ) : (
          <div
            className={cn(
              "rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)]",
              "bg-[var(--surface-base)] px-6 py-5"
            )}
          >
            <p className="text-base font-medium text-[var(--text-secondary)]">
              {t("continueWhereLeftOff")}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("continueEmpty")}
            </p>
          </div>
        )}

        {recent.length > 0 ? (
          <section aria-labelledby="home-recent-heading" className="pt-2">
            <h2
              id="home-recent-heading"
              className="mb-3 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
            >
              {t("recentWorksTitle")}
            </h2>
            <ul className="space-y-1.5" role="list">
              {recent.map((w) => (
                <li key={w.id}>
                  <Link
                    href={w.resumeHref}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)]",
                      "bg-[var(--surface-raised)] px-4 py-3 text-left transition-colors",
                      "hover:bg-[var(--surface-inset)]"
                    )}
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">
                      {w.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-[var(--text-muted)]">
                      {w.originKind === "creative_work"
                        ? t("originQuickTool")
                        : t("originCampaign")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
