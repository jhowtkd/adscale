import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";

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

    const guidedFlow = await getGuidedFlowByThread(workspace.id, threadId);
    if (!guidedFlow) {
      return apiError("guidedFlowNotFound", 404);
    }

    return NextResponse.json({ guidedFlow });
  } catch (error) {
    return handleApiError(error, "assistant.threads.[threadId].guided-flow.GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  await Promise.all([requireWorkspaceAccess(request), params]);
  return apiError("guidedFlowCommandsRequired", 409, {
    message: "Use the revision-safe guided-flow commands endpoint",
  });
}
