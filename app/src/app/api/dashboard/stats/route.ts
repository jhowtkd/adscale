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
      async (p: AnalyticsPeriod, cr: ReturnType<typeof parseCreditChartRange>) =>
        getDashboardStats(workspace.id, p, cr),
      ["dashboard-stats", workspace.id],
      {
        revalidate: 60,
        tags: [`dashboard:${workspace.id}`, "dashboard", "dashboard-stats"],
      }
    );
    const stats = await cachedStats(period, creditRange);
    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error, "dashboard.stats.GET");
  }
}
