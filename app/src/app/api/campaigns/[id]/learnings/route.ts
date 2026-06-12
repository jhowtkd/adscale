import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  LearningDomainError,
  listCampaignLearnings,
  recomputeLearningsForCampaign,
} from "@/server/performance/learning/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? undefined;
    const platform = url.searchParams.get("platform");

    const result = await listCampaignLearnings({
      workspaceId: workspace.id,
      campaignId,
      query,
      platform,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].learnings.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json().catch(() => ({}));
    if (body?.action !== "recompute") {
      return apiError("validation_error", 400);
    }

    const result = await recomputeLearningsForCampaign({
      workspaceId: workspace.id,
      campaignId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].learnings.POST");
  }
}
