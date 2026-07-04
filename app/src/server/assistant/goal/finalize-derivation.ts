import { GOAL_CREATIVE_LEVELS, GOAL_FORMATS } from "@/lib/assistant/goal";
import { adoptArtifactForThread } from "@/server/assistant/artifact-version/service";
import {
  AssistantGoalConflictError,
  getGoalRunScoped,
  markAnnotationsAddressed,
  updateGoalRun,
} from "@/server/repositories/assistant-goal";
import { getAssistantActionById } from "@/server/repositories/assistant-action";
import { syncAssistantActionFromJob } from "@/server/repositories/assistant-job-sync";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { createNotification } from "@/server/repositories/notification";

const TERMINAL = new Set(["completed", "approved", "failed", "rejected"]);

export async function finalizeGoalDerivation(input: {
  workspaceId: string;
  actionId: string;
  goalRunId: string;
  derivationId: string;
  generationMode: string;
  userId?: string;
  outcome?: "completed" | "failed";
}) {
  const action = await getAssistantActionById(input.workspaceId, input.actionId);
  if (!action || action.threadId === undefined) return;
  const thread = await getAssistantThreadById(input.workspaceId, action.threadId);
  if (!thread) return;
  const goal = await getGoalRunScoped(
    input.workspaceId,
    thread.clientProfileId,
    thread.id
  );
  if (!goal || goal.id !== input.goalRunId || !goal.campaignId) return;

  const adopted =
    input.outcome === "failed"
      ? null
      : await adoptArtifactForThread({
          workspaceId: input.workspaceId,
          threadId: thread.id,
          artifactType: "creative",
          artifactId: input.derivationId,
        });
  const producedVersionId = adopted?.working?.id ?? adopted?.approvedCurrent?.id;

  if (input.generationMode === "creative_revision" && producedVersionId) {
    const sourceVersionId = (action.inputSnapshot as Record<string, unknown>)
      .sourceVersionId;
    if (typeof sourceVersionId === "string") {
      await markAnnotationsAddressed({
        workspaceId: input.workspaceId,
        clientProfileId: thread.clientProfileId,
        threadId: thread.id,
        sourceVersionId,
        producedVersionId,
      });
    }
  }

  await syncAssistantActionFromJob({
    workspaceId: input.workspaceId,
    actionId: input.actionId,
    status: input.outcome ?? "completed",
    jobRef: { kind: "derivation", id: input.derivationId },
  });

  const derivations = await getDerivationsByCampaign(
    goal.campaignId,
    input.workspaceId
  );
  let stage: "choosing_base" | "reviewing_base" | "reviewing_package" | null = null;
  if (input.generationMode === "art_variation") {
    const slots = GOAL_CREATIVE_LEVELS.map((level) =>
      derivations.find((row) => row.format === "1:1" && row.creativeLevel === level)
    );
    if (slots.every((row) => row && TERMINAL.has(row.status))) stage = "choosing_base";
  } else if (input.generationMode === "format_adaptation") {
    const formats = GOAL_FORMATS.filter((format) => format !== "1:1");
    if (
      formats.every((format) =>
        derivations.some((row) => row.format === format && TERMINAL.has(row.status))
      )
    ) {
      stage = "reviewing_package";
    }
  } else if (input.generationMode === "creative_revision") {
    stage = "reviewing_base";
  }
  if (!stage || goal.stage === "stopped") return;

  try {
    await updateGoalRun({
      goalRunId: goal.id,
      workspaceId: input.workspaceId,
      clientProfileId: thread.clientProfileId,
      threadId: thread.id,
      expectedRevision: goal.revision,
      patch: { stage },
    });
    if (stage === "choosing_base" && input.userId) {
      await createNotification({
        userId: input.userId,
        workspaceId: input.workspaceId,
        type: "assistant_goal_ready",
        title: "Direções criativas prontas",
        message: "As três direções estão prontas para escolha.",
        campaignId: goal.campaignId,
      });
    }
  } catch (error) {
    if (!(error instanceof AssistantGoalConflictError)) throw error;
  }
}
