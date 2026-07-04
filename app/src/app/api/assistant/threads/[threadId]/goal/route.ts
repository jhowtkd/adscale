import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  AssistantGoalConflictError,
  getGoalRunScoped,
  updateGoalRun,
} from "@/server/repositories/assistant-goal";
import {
  cancelAssistantAction,
  getAssistantActionById,
} from "@/server/repositories/assistant-action";
import { emitGoalEvent } from "@/server/assistant/goal/analytics";
import type { GoalStage } from "@/lib/assistant/goal";

const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("stop"),
      expectedRevision: z.number().int().nonnegative(),
      pendingActionId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("resume"),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("abandon"),
      expectedRevision: z.number().int().nonnegative(),
      reason: z.string().trim().max(500).optional(),
    })
    .strict(),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { user, workspace } = await requireWorkspaceAccess(request);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = commandSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }
    const command = parsed.data;

    const goal = await getGoalRunScoped(
      workspace.id,
      thread.clientProfileId,
      threadId
    );
    if (!goal) {
      return apiError("goalNotFound", 404);
    }

    if (command.type === "stop") {
      // Stop cancels ONLY a still-pending action (before dispatch). Running
      // derivations keep running and stay charged — the pilot contract is
      // non-refundable once generation has started.
      if (command.pendingActionId) {
        const action = await getAssistantActionById(
          workspace.id,
          command.pendingActionId
        );
        if (action?.status === "pending") {
          await cancelAssistantAction(workspace.id, command.pendingActionId);
        }
      }
      await updateGoalRun({
        goalRunId: goal.id,
        workspaceId: workspace.id,
        clientProfileId: thread.clientProfileId,
        threadId,
        expectedRevision: command.expectedRevision,
        patch: { stage: "stopped", stoppedAt: new Date() },
      });
      await emitGoalEvent({
        workspaceId: workspace.id,
        clientProfileId: thread.clientProfileId,
        threadId,
        goalRunId: goal.id,
        event: "goal_stopped",
        metadata: { stage: goal.stage },
      });
      return NextResponse.json({ ok: true, stage: "stopped" });
    }

    if (command.type === "resume") {
      // Resume returns to the stage derived from the current artifacts/actions.
      // The client refetches the projection to get the authoritative stage; we
      // simply clear the stopped marker and let the derived stage take over.
      const resumedStage = await deriveResumedStage(goal.stage);
      await updateGoalRun({
        goalRunId: goal.id,
        workspaceId: workspace.id,
        clientProfileId: thread.clientProfileId,
        threadId,
        expectedRevision: command.expectedRevision,
        patch: { stage: resumedStage, stoppedAt: null },
      });
      return NextResponse.json({ ok: true, stage: resumedStage });
    }

    // abandon
    await updateGoalRun({
      goalRunId: goal.id,
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      expectedRevision: command.expectedRevision,
      patch: { stage: "stopped", stoppedAt: new Date() },
    });
    await emitGoalEvent({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      goalRunId: goal.id,
      event: "goal_abandoned",
      metadata: {
        stage: goal.stage,
        reasonCode: command.reason ?? "unspecified",
      },
    });
    return NextResponse.json({ ok: true, stage: "stopped" });
  } catch (error) {
    if (error instanceof AssistantGoalConflictError) {
      return apiError("goalConflict", 409);
    }
    return handleApiError(error, "assistant.goal.POST");
  }
}

/**
 * Resumes to a review-stage derived from where the goal was stopped. A stopped
 * generating stage returns to the preceding review/awaiting stage so the user
 * lands on the candidate/package grid rather than mid-generation.
 */
async function deriveResumedStage(stoppedStage: string): Promise<GoalStage> {
  switch (stoppedStage) {
    case "generating_variants":
      return "awaiting_generation";
    case "generating_package":
      return "awaiting_package";
    case "reviewing_base":
    case "choosing_base":
    case "reviewing_package":
    case "awaiting_generation":
    case "awaiting_package":
      return stoppedStage as GoalStage;
    default:
      return "intake";
  }
}
