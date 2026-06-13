"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export interface ReadinessBlockingSummary {
  blockingCount: number;
  topIssue?: string;
}

interface WorkspaceActionBarProps {
  onDerivar: () => void;
  onEstilizar: () => void;
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        aria-label={t("estilizar")}
        onClick={onEstilizar}
      >
        {t("estilizar")}
      </Button>
    </div>
  );
}
