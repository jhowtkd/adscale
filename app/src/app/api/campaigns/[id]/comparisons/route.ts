import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  HypothesisDomainError,
  listCampaignComparisons,
  runObservationalComparison,
} from "@/server/performance/hypothesis/service";
import { observationalComparisonSchema } from "@/server/performance/hypothesis/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const comparisons = await listCampaignComparisons({
      campaignId,
      workspaceId: workspace.id,
    });
    return NextResponse.json({ comparisons });
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].comparisons.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const parsed = observationalComparisonSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const result = await runObservationalComparison({
      workspaceId: workspace.id,
      userId: user.id,
      campaignId,
      data: parsed.data,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].comparisons.POST");
  }
}
