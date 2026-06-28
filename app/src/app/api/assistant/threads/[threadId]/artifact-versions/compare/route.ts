import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { compareArtifactVersions } from "@/server/assistant/artifact-version/comparison";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { ArtifactVersionValidationError } from "@/server/repositories/artifact-version";

const comparisonSelectionSchema = z
  .object({
    lineageId: z.string().uuid(),
    versionAId: z.string().uuid(),
    versionBId: z.string().uuid(),
    includeUnchanged: z.boolean().optional(),
  })
  .strict();

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
    if (!thread) return apiError("threadNotFound", 404);
    const parsed = comparisonSelectionSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("invalidInput", 400);

    return NextResponse.json(
      await compareArtifactVersions({
        workspaceId: workspace.id,
        threadId,
        ...parsed.data,
      })
    );
  } catch (error) {
    if (error instanceof ArtifactVersionValidationError) {
      return apiError("invalidComparisonSelection", 400);
    }
    return handleApiError(
      error,
      "assistant.threads.artifact-versions.compare.POST"
    );
  }
}
