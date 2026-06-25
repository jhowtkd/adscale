import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getAssistantThreadById,
} from "@/server/repositories/assistant-thread";
import { listAssistantMessages } from "@/server/repositories/assistant-message";

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

    const messages = await listAssistantMessages(workspace.id, threadId);
    return NextResponse.json({ thread, messages });
  } catch (error) {
    return handleApiError(error, "assistant.threads.[threadId].GET");
  }
}
