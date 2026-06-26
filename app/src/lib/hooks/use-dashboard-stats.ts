"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import type { DashboardStats, AnalyticsPeriod, CreditChartRange } from "@/server/repositories/dashboard";

async function fetchDashboardStats(
  period: AnalyticsPeriod,
  creditRange: CreditChartRange
): Promise<DashboardStats> {
  const res = await apiFetch(
    `/api/dashboard/stats?period=${period}&creditRange=${creditRange}`,
    {
      timeoutMs: 60_000,
    }
  );
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return (await res.json()) as DashboardStats;
}

export function useDashboardStats(
  period: AnalyticsPeriod = "month",
  creditRange: CreditChartRange = "7"
) {
  return useQuery({
    queryKey: ["dashboard", "stats", period, creditRange],
    queryFn: () => fetchDashboardStats(period, creditRange),
    staleTime: STALE_TIME.DYNAMIC,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}
