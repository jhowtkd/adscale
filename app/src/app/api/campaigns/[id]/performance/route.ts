import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignPerformanceSnapshots,
  PerformanceDomainError,
  recordPerformanceSnapshot,
} from "@/server/performance/service";
import { canonicalPerformanceSnapshotInputSchema } from "@/server/performance/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const snapshots = await getCampaignPerformanceSnapshots({
      campaignId,
      workspaceId: workspace.id,
    });
    return NextResponse.json({ snapshots });
  } catch (error) {
    if (error instanceof PerformanceDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].performance.GET");
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
    const parsed = canonicalPerformanceSnapshotInputSchema.safeParse(
      await request.json()
    );
    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }
    if (parsed.data.campaignId !== campaignId) {
      return apiError("performanceCampaignPathMismatch", 400);
    }

    const snapshot = await recordPerformanceSnapshot({
      workspaceId: workspace.id,
      userId: user.id,
      snapshot: parsed.data,
    });
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof PerformanceDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].performance.POST");
  }
}
