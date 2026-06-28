import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  CreativeFeedbackDraftValidationError,
  getCreativeFeedbackDraft,
  saveCreativeFeedbackDraft,
} from "@/server/assistant/creative-iteration/draft";

const draftSchema = z
  .object({
    draftText: z.string().max(2_000),
  })
  .strict();

async function scopedRequest(
  request: Request,
  params: Promise<{ threadId: string }>
) {
  const [{ workspace }, { threadId }] = await Promise.all([
    requireWorkspaceAccess(request),
    params,
  ]);
  const thread = await getAssistantThreadById(workspace.id, threadId);
  return { workspace, threadId, thread };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { workspace, threadId, thread } = await scopedRequest(request, params);
    if (!thread?.campaignId) return apiError("threadNotFound", 404);
    const draft = await getCreativeFeedbackDraft({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      campaignId: thread.campaignId,
      threadId,
    });
    if (!draft) return apiError("draftNotFound", 404);
    return NextResponse.json({ draftText: draft.draftText });
  } catch (error) {
    return handleApiError(error, "assistant.threads.creative-revisions.GET");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { workspace, threadId, thread } = await scopedRequest(request, params);
    if (!thread?.campaignId) return apiError("threadNotFound", 404);
    const parsed = draftSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());

    const draft = await saveCreativeFeedbackDraft(
      {
        workspaceId: workspace.id,
        clientProfileId: thread.clientProfileId,
        campaignId: thread.campaignId,
        threadId,
      },
      parsed.data.draftText
    );
    return NextResponse.json({ draftText: draft.draftText });
  } catch (error) {
    if (error instanceof CreativeFeedbackDraftValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.creative-revisions.PUT");
  }
}
