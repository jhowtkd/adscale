import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  getGoalRunScoped,
  submitAnnotationBatch,
} from "@/server/repositories/assistant-goal";

const submitSchema = z
  .object({
    goalRunId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    actionRecordId: z.string().uuid(),
  })
  .strict();

/**
 * Freezes every still-draft annotation for the source version as one paid
 * revision batch, stamping them with the action record that owns the revision.
 * The revision contract/handler consumes the frozen set server-side — the
 * client never sends annotation content here, only the scope identifiers.
 */
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
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const goal = await getGoalRunScoped(
      workspace.id,
      thread.clientProfileId,
      threadId
    );
    if (!goal || goal.id !== parsed.data.goalRunId) {
      return apiError("goalNotFound", 404);
    }

    const submitted = await submitAnnotationBatch({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      goalRunId: parsed.data.goalRunId,
      sourceVersionId: parsed.data.sourceVersionId,
      actionRecordId: parsed.data.actionRecordId,
    });

    return NextResponse.json({
      submittedCount: submitted.length,
      annotations: submitted,
    });
  } catch (error) {
    return handleApiError(error, "assistant.goal.annotations.submit.POST");
  }
}
