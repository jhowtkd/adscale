"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ReadinessBlockingSummary {
  blockingCount: number;
  topIssue?: string;
}

interface WorkspaceActionBarProps {
  onGenerate: () => void;
  onAdjustStrategy: () => void;
  /**
   * Optional restyle handler. When omitted, the Estilizar button is hidden
   * entirely (restyle is now surfaced as a `quick_restyle` chat action).
   */
  onEstilizar?: () => void;
  recommendedRecipeLabel?: string | null;
  isGenerating?: boolean;
  readinessBlocking?: ReadinessBlockingSummary | null;
  disabled?: boolean;
  className?: string;
}

export default function WorkspaceActionBar({
  onGenerate,
  onAdjustStrategy,
  onEstilizar,
  recommendedRecipeLabel,
  isGenerating,
  readinessBlocking,
  disabled,
  className,
}: WorkspaceActionBarProps) {
  const t = useTranslations("workspace.actionBar");
  const tReadiness = useTranslations("readiness");

  const hasBlocking =
    Boolean(readinessBlocking && readinessBlocking.blockingCount > 0);
  const generateBlocked = hasBlocking || disabled || isGenerating;

  const generateTitle = hasBlocking
    ? tReadiness("blockingBeforeDerivar", {
        count: readinessBlocking!.blockingCount,
      })
    : undefined;

  return (
    <div
      id="mission-generate"
      className={cn(
        "workspace-sticky-top layer-sticky border-b border-[var(--border-dim)] bg-[var(--surface-base)]/95 px-4 py-3 backdrop-blur-sm sm:px-6",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          size="sm"
          disabled={generateBlocked}
          title={generateTitle}
          aria-label={t("generate")}
          aria-describedby={hasBlocking ? "mission-generate-blocked" : undefined}
          className="min-h-9 bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:bg-[var(--accent-green-light)]"
          onClick={onGenerate}
        >
          {isGenerating ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles size={14} className="mr-1.5" aria-hidden="true" />
          )}
          {isGenerating ? t("generating") : t("generate")}
        </Button>

        <button
          type="button"
          disabled={disabled || isGenerating}
          onClick={onAdjustStrategy}
          className="min-h-9 rounded-[var(--radius-control)] px-1 text-xs font-medium text-[var(--text-secondary)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {t("adjustStrategy")}
        </button>

        {recommendedRecipeLabel ? (
          <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            <span className="shrink-0 text-[var(--accent-green-text)]">{t("recommended")}</span>
            <span className="truncate text-[var(--text-secondary)] normal-case tracking-normal">
              {recommendedRecipeLabel}
            </span>
          </span>
        ) : null}

        {onEstilizar ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || isGenerating}
            aria-label={t("estilizar")}
            onClick={onEstilizar}
            className="ml-auto min-h-9 border-[var(--accent-green)]/45 bg-[var(--accent-green)]/12 font-semibold text-[var(--accent-green-text)] hover:border-[var(--accent-green)]/60 hover:bg-[var(--accent-green)]/22 hover:text-[var(--accent-green-text)]"
          >
            <Sparkles size={14} aria-hidden="true" />
            {t("estilizar")}
          </Button>
        ) : null}
      </div>

      {hasBlocking ? (
        <p
          id="mission-generate-blocked"
          className="mt-2 text-xs text-[var(--warning-text)]"
          role="status"
        >
          {generateTitle}
          {readinessBlocking?.topIssue ? ` · ${readinessBlocking.topIssue}` : null}
        </p>
      ) : null}
    </div>
  );
}
