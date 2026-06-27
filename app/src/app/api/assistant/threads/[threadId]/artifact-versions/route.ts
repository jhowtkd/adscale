import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import {
  ArtifactLineageOwnershipError,
  adoptArtifactForThread,
  getThreadArtifactVersionState,
} from "@/server/assistant/artifact-version/service";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactHeadConflictError,
  ArtifactVersionValidationError,
} from "@/server/repositories/artifact-version";

const adoptArtifactSchema = z
  .object({
    artifactType: z.enum(["plan", "creative"]),
    artifactId: z.string().uuid(),
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
    if (!thread) return apiError("threadNotFound", 404);
    return NextResponse.json(
      await getThreadArtifactVersionState(workspace.id, threadId)
    );
  } catch (error) {
    if (error instanceof ArtifactVersionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.artifact-versions.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { workspace, threadId, thread } = await scopedRequest(request, params);
    if (!thread) return apiError("threadNotFound", 404);
    const parsed = adoptArtifactSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }
    const lineage = await adoptArtifactForThread({
      workspaceId: workspace.id,
      threadId,
      ...parsed.data,
    });
    return NextResponse.json({ lineage }, { status: 201 });
  } catch (error) {
    if (error instanceof ArtifactHeadConflictError) {
      return NextResponse.json(
        { error: "revisionConflict", message: error.message, head: error.head },
        { status: 409 }
      );
    }
    if (error instanceof ArtifactLineageOwnershipError) {
      return apiError("artifactLineageConflict", 409, { message: error.message });
    }
    if (error instanceof ArtifactVersionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.artifact-versions.POST");
  }
}

