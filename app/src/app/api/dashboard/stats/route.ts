import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDashboardStats, type AnalyticsPeriod, parseCreditChartRange } from "@/server/repositories/dashboard";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as AnalyticsPeriod) ?? "month";
    const creditRange = parseCreditChartRange(searchParams.get("creditRange"));
    const cachedStats = unstable_cache(
      async (workspaceId: string, p: AnalyticsPeriod, cr: ReturnType<typeof parseCreditChartRange>) =>
        getDashboardStats(workspaceId, p, cr),
      ["dashboard-stats"],
      { revalidate: 60, tags: ["dashboard", "dashboard-stats"] }
    );
    const stats = await cachedStats(workspace.id, period, creditRange);
    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error, "dashboard.stats.GET");
  }
}
