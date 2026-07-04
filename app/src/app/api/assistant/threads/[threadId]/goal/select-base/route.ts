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
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { emitGoalEvent } from "@/server/assistant/goal/analytics";

const selectBaseSchema = z
  .object({
    versionId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { workspace } = await requireWorkspaceAccess(request);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = selectBaseSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const goal = await getGoalRunScoped(
      workspace.id,
      thread.clientProfileId,
      threadId
    );
    if (!goal || !goal.campaignId) {
      return apiError("goalNotFound", 404);
    }

    // The selected version must belong to the current triplet: a 1:1 derivation
    // in this goal's campaign. This prevents selecting a stale or cross-client
    // version. Labels and actions are identical across candidates — no score,
    // recommendation, or default selection is applied.
    const derivations = await getDerivationsByCampaign(
      goal.campaignId,
      workspace.id
    );
    const belongs = derivations.some(
      (d) => d.id === parsed.data.versionId && d.format === "1:1"
    );
    if (!belongs) {
      return apiError("invalidInput", 400);
    }

    const updated = await updateGoalRun({
      goalRunId: goal.id,
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      expectedRevision: parsed.data.expectedRevision,
      patch: {
        stage: "reviewing_base",
        selectedBaseVersionId: parsed.data.versionId,
      },
    });

    await emitGoalEvent({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      goalRunId: goal.id,
      event: "goal_base_selected",
      metadata: {
        stage: "reviewing_base",
        candidateCount: derivations.filter((d) => d.format === "1:1").length,
      },
    });

    return NextResponse.json({ ok: true, revision: updated.revision });
  } catch (error) {
    if (error instanceof AssistantGoalConflictError) {
      return apiError("goalConflict", 409);
    }
    return handleApiError(error, "assistant.goal.select-base.POST");
  }
}
