import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  listClientOutputLearnings,
  OutputLearningDomainError,
  recomputeClientOutputLearnings,
} from "@/server/output-learning/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: clientProfileId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const learnings = await listClientOutputLearnings({
      workspaceId: workspace.id,
      clientProfileId,
    });

    return NextResponse.json({ learnings });
  } catch (error) {
    if (error instanceof OutputLearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "client-profiles.[id].output-learnings.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: clientProfileId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json().catch(() => ({}));
    if (body?.action !== "recompute") {
      return apiError("validation_error", 400);
    }

    const result = await recomputeClientOutputLearnings({
      workspaceId: workspace.id,
      clientProfileId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OutputLearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "client-profiles.[id].output-learnings.POST");
  }
}
