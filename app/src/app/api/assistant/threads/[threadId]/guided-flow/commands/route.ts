import { NextResponse } from "next/server";
import { guidedCommandEnvelopeSchema } from "@/lib/guided-flow/commands";
import { apiError, handleApiError } from "@/lib/api-response";
import { applyGuidedConversationCommand } from "@/server/assistant/guided-conversation/service";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  GuidedFlowRevisionConflictError,
  GuidedFlowValidationError,
} from "@/server/repositories/guided-flow";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ workspace }, { threadId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = guidedCommandEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await applyGuidedConversationCommand({
      workspaceId: workspace.id,
      threadId,
      clientProfileId: thread.clientProfileId,
      envelope: parsed.data,
    });

    return NextResponse.json({
      presentation: result.presentation,
      guidedFlow: result.guidedFlow,
      noop: result.noop ?? false,
    });
  } catch (error) {
    if (error instanceof GuidedFlowRevisionConflictError) {
      return NextResponse.json(
        {
          error: "revisionConflict",
          message: error.message,
          presentation: error.presentation,
        },
        { status: 409 }
      );
    }
    if (error instanceof GuidedFlowValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(
      error,
      "assistant.threads.[threadId].guided-flow.commands.POST"
    );
  }
}
