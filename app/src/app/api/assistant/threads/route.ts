import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createAssistantThread,
  getOrCreateDefaultCampaignThread,
  listAssistantThreads,
  AssistantThreadValidationError,
} from "@/server/repositories/assistant-thread";

const listQuerySchema = z.object({
  clientProfileId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
});

const createThreadSchema = z.object({
  clientProfileId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      clientProfileId: url.searchParams.get("clientProfileId"),
      campaignId: url.searchParams.get("campaignId") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const threads = await listAssistantThreads(workspace.id, parsed.data);
    return NextResponse.json({ threads });
  } catch (error) {
    return handleApiError(error, "assistant.threads.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createThreadSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { clientProfileId, campaignId, name, isDefault } = parsed.data;

    const thread =
      campaignId && isDefault
        ? await getOrCreateDefaultCampaignThread(
            workspace.id,
            clientProfileId,
            campaignId
          )
        : await createAssistantThread(workspace.id, {
            clientProfileId,
            campaignId,
            name,
            isDefault,
          });

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    if (error instanceof AssistantThreadValidationError) {
      return apiError("threadNotFound", 404);
    }
    return handleApiError(error, "assistant.threads.POST");
  }
}
