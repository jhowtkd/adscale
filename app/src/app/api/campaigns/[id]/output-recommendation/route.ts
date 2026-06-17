import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getOutputLearningRecommendation,
  OutputLearningDomainError,
} from "@/server/output-learning/recommendation/service";

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
    const generationMode = url.searchParams.get("generationMode") ?? undefined;
    const format = url.searchParams.get("format") ?? undefined;

    const result = await getOutputLearningRecommendation({
      workspaceId: workspace.id,
      campaignId,
      generationMode,
      format,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OutputLearningDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].output-recommendation.GET");
  }
}
