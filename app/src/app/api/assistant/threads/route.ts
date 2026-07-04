import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createAssistantThread,
  getOrCreateDefaultCampaignThread,
  listAssistantThreads,
  AssistantThreadValidationError,
} from "@/server/repositories/assistant-thread";
import {
  AssistantGoalPilotError,
  resolveAssistantExperience,
} from "@/server/assistant/goal/pilot";
import { createGoalRun } from "@/server/repositories/assistant-goal";

const createThreadSchema = z.object({
  clientProfileId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
  experience: z.enum(["agent", "classic"]).optional(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const url = new URL(request.url);
    const clientProfileId = url.searchParams.get("clientProfileId");
    const rawCampaignId = url.searchParams.get("campaignId");

    const clientParsed = z.string().uuid().safeParse(clientProfileId);
    if (!clientParsed.success) {
      return apiError("invalidInput", 400, clientParsed.error.flatten());
    }

    let campaignId: string | null | undefined;
    if (rawCampaignId === null) {
      campaignId = undefined;
    } else if (rawCampaignId === "null") {
      campaignId = null;
    } else {
      const campaignParsed = z.string().uuid().safeParse(rawCampaignId);
      if (!campaignParsed.success) {
        return apiError("invalidInput", 400, campaignParsed.error.flatten());
      }
      campaignId = campaignParsed.data;
    }

    const threads = await listAssistantThreads(workspace.id, {
      clientProfileId: clientParsed.data,
      campaignId,
    });
    return NextResponse.json({ threads });
  } catch (error) {
    return handleApiError(error, "assistant.threads.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;
    const body = await request.json();
    const parsed = createThreadSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { clientProfileId, campaignId, name, isDefault, experience } =
      parsed.data;

    const resolvedExperience = await resolveAssistantExperience({
      workspaceId: workspace.id,
      userEmail: user.email,
      requested: experience,
    });

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

    // The goal-agent pilot owns one creative objective per thread. Creating the
    // goal run here (not the campaign) keeps the durable pilot state separate
    // from the legacy guided-flow tables until the brief is ready.
    if (resolvedExperience === "agent") {
      await createGoalRun({
        workspaceId: workspace.id,
        clientProfileId,
        threadId: thread.id,
        userId: user.id,
      });
    }

    return NextResponse.json({ thread, experience: resolvedExperience }, { status: 201 });
  } catch (error) {
    if (error instanceof AssistantThreadValidationError) {
      return apiError("threadNotFound", 404);
    }
    if (error instanceof AssistantGoalPilotError) {
      return apiError(error.code, 403);
    }
    return handleApiError(error, "assistant.threads.POST");
  }
}
