import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  LearningDomainError,
  listClientLearnings,
  recomputeClientLearnings,
  searchClientLearnings,
} from "@/server/performance/learning/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: clientProfileId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const query = url.searchParams.get("q") ?? undefined;
    const platform = url.searchParams.get("platform");
    const objective = url.searchParams.get("objective");

    if (mode === "search") {
      const result = await searchClientLearnings({
        workspaceId: workspace.id,
        clientProfileId,
        query,
        platform,
        campaignObjective: objective,
      });
      return NextResponse.json(result);
    }

    const learnings = await listClientLearnings({
      workspaceId: workspace.id,
      clientProfileId,
    });

    return NextResponse.json({ learnings });
  } catch (error) {
    if (error instanceof LearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "client-profiles.[id].learnings.GET");
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

    const result = await recomputeClientLearnings({
      workspaceId: workspace.id,
      clientProfileId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "client-profiles.[id].learnings.POST");
  }
}
