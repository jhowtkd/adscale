"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type WorkspaceStageState = "piloto" | "acoes" | "derivando" | "estilizando" | "gerando";

export default function WorkspaceStageStrip({
  workspaceState,
  className,
}: {
  workspaceState: WorkspaceStageState;
  className?: string;
}) {
  const t = useTranslations("workspace.stages");
  const inPilot = workspaceState === "piloto";

  return (
    <nav
      aria-label={t("label")}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <StagePill active={inPilot} label={t("pilot")} />
      <StagePill active={!inPilot} label={t("workspace")} />
    </nav>
  );
}

function StagePill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
          : "bg-[var(--surface-raised)] text-[var(--text-muted)]",
      )}
      aria-current={active ? "step" : undefined}
    >
      {label}
    </span>
  );
}
