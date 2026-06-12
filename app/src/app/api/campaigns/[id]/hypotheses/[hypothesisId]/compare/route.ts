import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  HypothesisDomainError,
  runHypothesisComparison,
} from "@/server/performance/hypothesis/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; hypothesisId: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId, hypothesisId }] =
      await Promise.all([requireWorkspaceAccess(request), params]);

    const result = await runHypothesisComparison({
      workspaceId: workspace.id,
      userId: user.id,
      campaignId,
      hypothesisId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(
      error,
      "campaigns.[id].hypotheses.[hypothesisId].compare.POST"
    );
  }
}
