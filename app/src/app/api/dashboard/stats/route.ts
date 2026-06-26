import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDashboardStats, type AnalyticsPeriod, parseCreditChartRange } from "@/server/repositories/dashboard";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as AnalyticsPeriod) ?? "month";
    const creditRange = parseCreditChartRange(searchParams.get("creditRange"));
    const stats = await getDashboardStats(workspace.id, period, creditRange);
    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error, "dashboard.stats.GET");
  }
}
