import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  deleteUnusedAssistantThread,
  getAssistantThreadById,
} from "@/server/repositories/assistant-thread";
import { listAssistantMessages } from "@/server/repositories/assistant-message";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { journeyStateFromRow } from "@/server/assistant/guided-conversation/state";
import { presentJourneyState } from "@/server/assistant/guided-conversation/presenter";
import { getThreadArtifactVersionState } from "@/server/assistant/artifact-version/service";
import { buildGoalProjection } from "@/server/assistant/goal/projection";
import { listArtifactLineages } from "@/server/repositories/artifact-version";

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

    const campaignId = thread.campaignId;
    const lineages = campaignId
      ? await listArtifactLineages({
          workspaceId: workspace.id,
          clientProfileId: thread.clientProfileId,
          campaignId,
          threadId,
        }).catch(() => undefined)
      : undefined;

    const [messages, guidedFlow, artifactVersionState, goalProjection] =
      await Promise.all([
        listAssistantMessages(workspace.id, threadId),
        getGuidedFlowByThread(workspace.id, threadId),
        getThreadArtifactVersionState(workspace.id, threadId, { thread, lineages }).catch(
          () => null
        ),
        buildGoalProjection({
          workspaceId: workspace.id,
          clientProfileId: thread.clientProfileId,
          threadId,
          ...(campaignId && lineages ? { preload: { campaignId, lineages } } : {}),
        }).catch(() => null),
      ]);

    return NextResponse.json({
      thread,
      messages,
      ...(artifactVersionState ? { artifactVersionState } : {}),
      goalProjection,
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

/**
 * Takes back a conversation created and never used (the cleanup when binding it to an Equipe account was refused).
 * Only that: see `deleteUnusedAssistantThread`. Anything else answers 409.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ workspace }, { threadId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    if (!z.string().uuid().safeParse(threadId).success) {
      return apiError("threadNotFound", 404);
    }
    const result = await deleteUnusedAssistantThread(workspace.id, threadId);
    if (result === "not_found") return apiError("threadNotFound", 404);
    if (result === "in_use") return apiError("threadInUse", 409);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error, "assistant.threads.[threadId].DELETE");
  }
}
