import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import {
  comparisonAcknowledgementCommandSchema,
  comparisonAcknowledgementSchema,
} from "@/lib/assistant/artifact-version";
import { acknowledgeLinkedPlanComparison } from "@/server/assistant/artifact-version/promotion";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { ArtifactVersionValidationError } from "@/server/repositories/artifact-version";

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
    const parsed = comparisonAcknowledgementCommandSchema.safeParse(
      await request.json()
    );
    if (!parsed.success) return apiError("invalidInput", 400);
    const acknowledgement = await acknowledgeLinkedPlanComparison({
      workspaceId: workspace.id,
      threadId,
      command: parsed.data,
    });
    return NextResponse.json(
      comparisonAcknowledgementSchema.parse(acknowledgement),
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ArtifactVersionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(
      error,
      "assistant.threads.artifact-versions.comparison-acknowledgements.POST"
    );
  }
}
