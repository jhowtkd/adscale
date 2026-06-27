import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getAssistantThreadById,
} from "@/server/repositories/assistant-thread";
import { listAssistantMessages } from "@/server/repositories/assistant-message";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { journeyStateFromRow } from "@/server/assistant/guided-conversation/state";
import { presentJourneyState } from "@/server/assistant/guided-conversation/presenter";
import { getThreadArtifactVersionState } from "@/server/assistant/artifact-version/service";

export async function GET(
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

    const [messages, guidedFlow, artifactVersionState] = await Promise.all([
      listAssistantMessages(workspace.id, threadId),
      getGuidedFlowByThread(workspace.id, threadId),
      getThreadArtifactVersionState(workspace.id, threadId),
    ]);

    return NextResponse.json({
      thread,
      messages,
      artifactVersionState,
      ...(guidedFlow
        ? {
            guidedFlow,
            guidedPresentation: presentJourneyState(journeyStateFromRow(guidedFlow)),
          }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "assistant.threads.[threadId].GET");
  }
}
