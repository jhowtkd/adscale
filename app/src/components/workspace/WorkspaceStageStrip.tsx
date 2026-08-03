"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type WorkspaceStageState = "setup" | "trabalho";

export type WorkspaceStagePhase = "prepare" | "generate" | "deliver";

export default function WorkspaceStageStrip({
  workspaceState,
  currentPhase,
  onPhaseSelect,
  className,
}: {
  workspaceState: WorkspaceStageState;
  /** Override derived phase (e.g. deliver when approvals exist). */
  currentPhase?: WorkspaceStagePhase;
  onPhaseSelect?: (phase: WorkspaceStagePhase) => void;
  className?: string;
}) {
  const t = useTranslations("workspace.stages");
  const phase: WorkspaceStagePhase =
    currentPhase ?? (workspaceState === "setup" ? "prepare" : "generate");

  const phases: { id: WorkspaceStagePhase; label: string }[] = [
    { id: "prepare", label: t("prepare") },
    { id: "generate", label: t("generate") },
    { id: "deliver", label: t("deliver") },
  ];

  return (
    <nav
      aria-label={t("label")}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {phases.map((item) => {
        const active = item.id === phase;
        if (onPhaseSelect) {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPhaseSelect(item.id)}
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
                active
                  ? "border border-[var(--selection-border)] bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
              aria-current={active ? "step" : undefined}
            >
              {item.label}
            </button>
          );
        }
        return (
          <StagePill key={item.id} active={active} label={item.label} />
        );
      })}
    </nav>
  );
}

function StagePill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border border-[var(--selection-border)] bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
      )}
      aria-current={active ? "step" : undefined}
    >
      {label}
    </span>
  );
}
