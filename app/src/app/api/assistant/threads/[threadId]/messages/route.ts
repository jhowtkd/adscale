import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  AssistantMessageValidationError,
  createAssistantMessage,
} from "@/server/repositories/assistant-message";

const messageTypeSchema = z.enum(["user", "assistant", "tool"]);

const createMessageSchema = z.object({
  type: messageTypeSchema,
  content: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

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

    if (body?.type === "action_card") {
      return apiError("invalidInput", 400, {
        message: "action_card messages must be created via action repository",
      });
    }

    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const message = await createAssistantMessage(workspace.id, {
      threadId,
      type: parsed.data.type,
      content: parsed.data.content,
      payload: parsed.data.payload,
    } as Parameters<typeof createAssistantMessage>[1]);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof AssistantMessageValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.[threadId].messages.POST");
  }
}
