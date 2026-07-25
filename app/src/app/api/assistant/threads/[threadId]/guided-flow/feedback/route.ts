import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import {
  GuidedFlowFeedbackValidationError,
  insertGuidedFlowFeedback,
  listGuidedFlowFeedbackByThread,
} from "@/server/repositories/guided-flow-feedback";

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  feedbackKind: z.enum(["diagnosis_utility", "creative_plan_readiness"]),
  rating: z.string().min(1),
  reasonText: z.string().max(256).nullable().optional(),
  step: z.string().min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ user }, { threadId }] = await Promise.all([
      requirePlatformOwner(request),
      params,
    ]);

    const parsedWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!parsedWorkspaceId) {
      return apiError("invalidInput", 400, { message: "workspaceId is required" });
    }

    const thread = await getAssistantThreadById(parsedWorkspaceId, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const feedback = await listGuidedFlowFeedbackByThread(parsedWorkspaceId, threadId);
    return NextResponse.json({ feedback });
  } catch (error) {
    return handleApiError(
      error,
      "assistant.threads.[threadId].guided-flow.feedback.GET"
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ user }, { threadId }] = await Promise.all([
      requirePlatformOwner(request),
      params,
    ]);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const thread = await getAssistantThreadById(parsed.data.workspaceId, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const flow = await getGuidedFlowByThread(parsed.data.workspaceId, threadId);
    if (!flow) {
      return apiError("guidedFlowNotFound", 404);
    }

    const feedback = await insertGuidedFlowFeedback({
      workspaceId: parsed.data.workspaceId,
      clientProfileId: thread.clientProfileId,
      threadId,
      guidedFlowId: flow.id,
      path: flow.path,
      step: parsed.data.step ?? flow.currentStep,
      feedbackKind: parsed.data.feedbackKind,
      rating: parsed.data.rating,
      reasonText: parsed.data.reasonText ?? null,
      userId: user.id,
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    if (error instanceof GuidedFlowFeedbackValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(
      error,
      "assistant.threads.[threadId].guided-flow.feedback.POST"
    );
  }
}
