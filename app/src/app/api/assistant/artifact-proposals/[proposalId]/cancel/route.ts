import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { cancelPlanRevision } from "@/server/assistant/plan-iteration/proposal";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { ArtifactVersionValidationError } from "@/server/repositories/artifact-version";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  try {
    const [{ workspace }, { proposalId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = (await request.json().catch(() => ({}))) as {
      threadId?: string;
    };
    if (typeof body.threadId !== "string") {
      return apiError("invalidInput", 400);
    }

    const thread = await getAssistantThreadById(workspace.id, body.threadId);
    if (!thread?.campaignId) return apiError("threadNotFound", 404);

    const proposal = await cancelPlanRevision(
      {
        workspaceId: workspace.id,
        clientProfileId: thread.clientProfileId,
        campaignId: thread.campaignId,
        threadId: thread.id,
      },
      proposalId
    );

    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof ArtifactVersionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.artifact-proposals.cancel.POST");
  }
}
