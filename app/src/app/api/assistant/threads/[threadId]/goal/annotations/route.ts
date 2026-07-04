import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  getGoalRunScoped,
  listAnnotationsForVersion,
  upsertAnnotationDraft,
} from "@/server/repositories/assistant-goal";

const createAnnotationSchema = z
  .object({
    goalRunId: z.string().uuid(),
    versionId: z.string().uuid(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    comment: z.string().trim().min(1).max(1_000),
  })
  .refine(
    (r) => r.x + r.width <= 1 && r.y + r.height <= 1,
    "rectangle_out_of_bounds"
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { user, workspace } = await requireWorkspaceAccess(request);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = createAnnotationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const goal = await getGoalRunScoped(
      workspace.id,
      thread.clientProfileId,
      threadId
    );
    if (!goal || goal.id !== parsed.data.goalRunId) {
      return apiError("goalNotFound", 404);
    }

    const annotation = await upsertAnnotationDraft({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      threadId,
      goalRunId: parsed.data.goalRunId,
      versionId: parsed.data.versionId,
      createdByUserId: user.id,
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width,
      height: parsed.data.height,
      comment: parsed.data.comment,
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "assistant.goal.annotations.POST");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { workspace } = await requireWorkspaceAccess(request);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const url = new URL(request.url);
    const versionId = url.searchParams.get("versionId");
    const goalRunId = url.searchParams.get("goalRunId");
    if (!versionId || !goalRunId) {
      return apiError("invalidInput", 400);
    }

    const annotations = await listAnnotationsForVersion(
      workspace.id,
      goalRunId,
      versionId
    );

    return NextResponse.json({ annotations });
  } catch (error) {
    return handleApiError(error, "assistant.goal.annotations.GET");
  }
}
