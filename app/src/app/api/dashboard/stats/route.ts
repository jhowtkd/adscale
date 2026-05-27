import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDashboardStats, type AnalyticsPeriod } from "@/server/repositories/dashboard";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as AnalyticsPeriod) ?? "month";
    const stats = await getDashboardStats(workspace.id, period);
    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error, "dashboard.stats.GET");
  }
}
