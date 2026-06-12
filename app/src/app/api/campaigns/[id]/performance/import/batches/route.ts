import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { listBatches } from "@/server/performance/import/service";
import { PerformanceDomainError } from "@/server/performance/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const batches = await listBatches({
      campaignId,
      workspaceId: workspace.id,
    });

    return NextResponse.json({ batches });
  } catch (error) {
    if (error instanceof PerformanceDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].performance.import.batches.GET");
  }
}
