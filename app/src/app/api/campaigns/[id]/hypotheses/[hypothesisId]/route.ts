import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  HypothesisDomainError,
  removeCampaignHypothesis,
  updateCampaignHypothesis,
} from "@/server/performance/hypothesis/service";
import { updateHypothesisSchema } from "@/server/performance/hypothesis/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; hypothesisId: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId, hypothesisId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const parsed = updateHypothesisSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const hypothesis = await updateCampaignHypothesis({
      workspaceId: workspace.id,
      campaignId,
      hypothesisId,
      data: parsed.data,
    });
    return NextResponse.json({ hypothesis });
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].hypotheses.[hypothesisId].PATCH");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; hypothesisId: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId, hypothesisId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    await removeCampaignHypothesis({
      workspaceId: workspace.id,
      campaignId,
      hypothesisId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HypothesisDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].hypotheses.[hypothesisId].DELETE");
  }
}
