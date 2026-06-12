import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createCampaignHypothesis,
  HypothesisDomainError,
  listCampaignHypotheses,
} from "@/server/performance/hypothesis/service";
import { createHypothesisSchema } from "@/server/performance/hypothesis/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const hypotheses = await listCampaignHypotheses({
      campaignId,
      workspaceId: workspace.id,
    });
    return NextResponse.json({ hypotheses });
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].hypotheses.GET");
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
    const parsed = createHypothesisSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const hypothesis = await createCampaignHypothesis({
      workspaceId: workspace.id,
      userId: user.id,
      campaignId,
      data: parsed.data,
    });
    return NextResponse.json({ hypothesis }, { status: 201 });
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].hypotheses.POST");
  }
}
