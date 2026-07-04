"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AssistantGoalPresentation } from "@/lib/assistant/goal";

export interface AssistantGoalPlanProps {
  projection: AssistantGoalPresentation;
  onStop?: () => void;
  onResume?: () => void;
  isStopping?: boolean;
}

const STEP_STATUS_DOT: Record<string, string> = {
  pending: "bg-[var(--neutral-dot)]",
  active: "bg-[var(--accent-primary)]",
  done: "bg-[var(--success)]",
  blocked: "bg-[var(--danger-text)]",
};

/**
 * Compact, always-visible summary of the live goal plan: the four steps, the
 * current stage, editable assumptions, and any remaining blockers. Hosts the
 * stop/resume controls so the user can manage the background lifecycle without
 * leaving the workspace.
 */
export default function AssistantGoalPlan({
  projection,
  onStop,
  onResume,
  isStopping,
}: AssistantGoalPlanProps) {
  const t = useTranslations("assistant.goal");

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="assistant-goal-plan"
      aria-label={t("candidates")}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t(`stage.${projection.stage}`)}
        </h2>
        <div className="flex items-center gap-2">
          {projection.stage === "stopped" && onResume ? (
            <button
              type="button"
              onClick={onResume}
              className="rounded-md border border-[var(--border-dim)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {t("resume")}
            </button>
          ) : null}
          {onStop && projection.stage !== "stopped" && projection.stage !== "completed" ? (
            <button
              type="button"
              data-testid="assistant-goal-stop"
              onClick={onStop}
              disabled={isStopping}
              className="rounded-md border border-[var(--border-dim)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--danger-text)] disabled:opacity-50"
            >
              {t("stop")}
            </button>
          ) : null}
        </div>
      </div>

      <ol className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
        {projection.planSteps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={cn("size-2 rounded-full", STEP_STATUS_DOT[step.status])}
              aria-hidden="true"
            />
            <span>{t(`planStep.${step.key}`)}</span>
            {index < projection.planSteps.length - 1 ? (
              <span className="mx-1 text-[var(--border-dim)]" aria-hidden="true">·</span>
            ) : null}
          </li>
        ))}
      </ol>

      {projection.assumptions.length > 0 ? (
        <div className="text-xs text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-secondary)]">{t("assumptions")}:</span>{" "}
          {projection.assumptions.join(" · ")}
        </div>
      ) : null}

      {projection.blockers.length > 0 ? (
        <div className="text-xs text-[var(--danger-text)]">
          <span className="font-medium">{t("blockers")}:</span>{" "}
          {projection.blockers.join(", ")}
        </div>
      ) : null}
    </section>
  );
}
