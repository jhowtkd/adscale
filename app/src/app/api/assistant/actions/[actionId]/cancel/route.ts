import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  cancelAssistantAction,
  InvalidActionTransitionError,
} from "@/server/repositories/assistant-action";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { transitionGuidedFlowAfterAction } from "@/server/assistant/guided-paths/action-integration";

const cancelSchema = z.object({
  safeError: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const [{ workspace }, { actionId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const action = await cancelAssistantAction(
      workspace.id,
      actionId,
      parsed.data.safeError
    );
    if (!action) {
      return apiError("actionNotFound", 404);
    }
    const thread = await getAssistantThreadById(workspace.id, action.threadId);
    if (thread) {
      await transitionGuidedFlowAfterAction({
        workspaceId: workspace.id,
        threadId: action.threadId,
        clientProfileId: thread.clientProfileId,
        actionId,
        result: "canceled",
      });
    }

    return NextResponse.json({ action });
  } catch (error) {
    if (error instanceof InvalidActionTransitionError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.actions.[actionId].cancel.POST");
  }
}
