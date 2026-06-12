import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getNextExperimentRecommendation,
  LearningDomainError,
} from "@/server/performance/recommendation/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const result = await getNextExperimentRecommendation({
      workspaceId: workspace.id,
      campaignId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].recommendation.GET");
  }
}
