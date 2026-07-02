"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export interface ReadinessBlockingSummary {
  blockingCount: number;
  topIssue?: string;
}

interface WorkspaceActionBarProps {
  onDerivar: () => void;
  /**
   * Optional restyle handler. When omitted, the Estilizar button is hidden
   * entirely (restyle is now surfaced as a `quick_restyle` chat action).
   */
  onEstilizar?: () => void;
  readinessBlocking?: ReadinessBlockingSummary | null;
  disabled?: boolean;
  className?: string;
}

export default function WorkspaceActionBar({
  onDerivar,
  onEstilizar,
  readinessBlocking,
  disabled,
  className,
}: WorkspaceActionBarProps) {
  const t = useTranslations("workspace.actionBar");
  const tReadiness = useTranslations("readiness");

  const derivarBlocked =
    Boolean(readinessBlocking && readinessBlocking.blockingCount > 0) || disabled;

  const derivarTitle =
    readinessBlocking && readinessBlocking.blockingCount > 0
      ? tReadiness("blockingBeforeDerivar", { count: readinessBlocking.blockingCount })
      : undefined;

  return (
    <div
      id="mission-generate"
      className={cn(
        "workspace-sticky-top layer-sticky flex flex-wrap items-center gap-2 border-b border-[var(--border-dim)] bg-[var(--surface-base)]/95 px-4 py-3 backdrop-blur-sm sm:px-6",
        className
      )}
    >
      <Button
        type="button"
        size="sm"
        disabled={derivarBlocked}
        title={derivarTitle}
        aria-label={t("derivar")}
        className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:bg-[var(--accent-green-light)]"
        onClick={onDerivar}
      >
        {t("derivar")}
      </Button>
      {onEstilizar ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={t("estilizar")}
          onClick={onEstilizar}
          className="border-[var(--accent-green)]/45 bg-[var(--accent-green)]/12 font-semibold text-[var(--accent-green-text)] hover:border-[var(--accent-green)]/60 hover:bg-[var(--accent-green)]/22 hover:text-[var(--accent-green-text)]"
        >
          <Sparkles size={14} aria-hidden="true" />
          {t("estilizar")}
        </Button>
      ) : null}
    </div>
  );
}
