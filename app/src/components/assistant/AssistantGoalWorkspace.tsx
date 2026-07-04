"use client";

import { useTranslations } from "next-intl";
import type { AssistantGoalPresentation } from "@/lib/assistant/goal";
import { useAssistantGoal } from "@/lib/hooks/use-assistant-goal";
import AssistantGoalPlan from "./AssistantGoalPlan";
import CreativeTripletGrid from "./CreativeTripletGrid";
import { apiFetch } from "@/lib/api-client";

export interface AssistantGoalWorkspaceProps {
  threadId: string;
  projection: AssistantGoalPresentation;
}

/**
 * Stage-aware host for the goal workspace. The desktop layout swaps from the
 * conversation grid to the workspace grid once candidates exist, so the visual
 * workspace never shrinks below 640px. This component renders the right panel
 * for the current stage: the live plan + neutral triplet during base selection,
 * and (in later tasks) the annotation editor and four-format package review.
 */
export default function AssistantGoalWorkspace({
  threadId,
  projection,
}: AssistantGoalWorkspaceProps) {
  const t = useTranslations("assistant.goal");
  const { stop, resume, isStopping } = useGoalLifecycle(threadId, projection.revision);

  const showTriplet =
    projection.candidates.length > 0 &&
    (projection.stage === "choosing_base" ||
      projection.stage === "reviewing_base" ||
      projection.stage === "generating_variants");

  return (
    <div
      className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4"
      data-testid="assistant-goal-workspace"
    >
      <AssistantGoalPlan
        projection={projection}
        onStop={stop}
        onResume={resume}
        isStopping={isStopping}
      />

      {showTriplet ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("candidates")}
          </h3>
          <CreativeTripletGrid
            candidates={projection.candidates}
            expectedRevision={projection.revision}
            selectedBaseVersionId={projection.selectedBaseVersionId}
            onSelectBase={(versionId, expectedRevision) => {
              void apiFetch(
                `/api/assistant/threads/${threadId}/goal/select-base`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ versionId, expectedRevision }),
                }
              );
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

function useGoalLifecycle(threadId: string, revision: number) {
  const goal = useAssistantGoal();
  return {
    stop: () => goal.stop({ threadId, expectedRevision: revision }),
    resume: () => goal.resume({ threadId, expectedRevision: revision }),
    isStopping: goal.command.isPending,
  };
}
