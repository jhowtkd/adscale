import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getBatchDetail } from "@/server/performance/import/service";
import { PerformanceDomainError } from "@/server/performance/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId, batchId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const detail = await getBatchDetail({
      campaignId,
      workspaceId: workspace.id,
      batchId,
    });

    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof PerformanceDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(
      error,
      "campaigns.[id].performance.import.batches.[batchId].GET"
    );
  }
}
