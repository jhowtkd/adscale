import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  AssistantThreadValidationError,
  linkThreadToCampaign,
} from "@/server/repositories/assistant-thread";

const linkSchema = z.object({
  campaignId: z.string().uuid(),
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

    const body = await request.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const thread = await linkThreadToCampaign(
      workspace.id,
      threadId,
      parsed.data.campaignId
    );

    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    return NextResponse.json({ thread });
  } catch (error) {
    if (error instanceof AssistantThreadValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.[threadId].link-campaign.POST");
  }
}
