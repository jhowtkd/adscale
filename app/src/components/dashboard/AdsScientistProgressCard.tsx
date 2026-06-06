"use client";

import Link from "next/link";
import { FlaskConical, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useProgression } from "@/lib/hooks/use-progression";

export default function AdsScientistProgressCard() {
  const t = useTranslations("dashboard.progression");
  const { data, isLoading, isError, refetch, isFetching } = useProgression();

  if (isLoading && !data) {
    return (
      <div className="glass-card rounded-xl overflow-hidden" aria-busy="true">
        <div className="px-5 py-4 border-b border-[var(--border-dim)]">
          <div className="h-4 w-40 bg-[var(--surface-raised)] rounded animate-pulse" />
        </div>
        <div className="p-5 space-y-4">
          <div className="h-6 w-56 bg-[var(--surface-raised)] rounded animate-pulse" />
          <div className="h-2 w-full bg-[var(--surface-raised)] rounded-full animate-pulse" />
          <div className="h-10 w-full bg-[var(--surface-raised)] rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-dim)] flex items-center gap-2">
          <FlaskConical size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        </div>
        <div className="p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-[var(--accent-rose)] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-dark)] hover:text-[var(--accent-green)] transition-colors"
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t("retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { level, progressPercent, nextAction } = data;
  const ctaDisabled = nextAction.blocked;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-dim)]">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        </div>
        {isFetching ? <span className="sr-only">{t("updating")}</span> : null}
      </div>

      <div className="p-5 space-y-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {t("currentLevel")}
          </p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{level.label}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{level.description}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
              {t("progressLabel")}
            </span>
            <span className="text-xs font-mono font-bold text-[var(--accent-green)]">
              {progressPercent}%
            </span>
          </div>
          <div
            className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("progressAria", { percent: progressPercent })}
          >
            <div
              className="h-full rounded-full bg-[var(--accent-green)] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--deep-bg)] p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {t("nextExperiment")}
          </p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{nextAction.label}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{nextAction.description}</p>
          {nextAction.blocked && nextAction.blockedReason ? (
            <p className="text-xs text-[var(--accent-rose)] mt-2 flex items-start gap-1.5">
              <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
              {nextAction.blockedReason}
            </p>
          ) : null}

          {ctaDisabled ? (
            <span
              className={cn(
                "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--border-dim)] px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]"
              )}
            >
              {t("blockedCta")}
            </span>
          ) : (
            <Link
              href={nextAction.href}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10 px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-text)] hover:bg-[var(--accent-green)]/20 transition-colors"
            >
              {t("cta")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
