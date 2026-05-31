"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import type { DashboardStats, AnalyticsPeriod } from "@/server/repositories/dashboard";

async function fetchDashboardStats(period: AnalyticsPeriod): Promise<DashboardStats> {
  const res = await apiFetch(`/api/dashboard/stats?period=${period}`);
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

export function useDashboardStats(period: AnalyticsPeriod = "month") {
  return useQuery({
    queryKey: ["dashboard", "stats", period],
    queryFn: () => fetchDashboardStats(period),
    staleTime: STALE_TIME.DYNAMIC,
    placeholderData: (previous) => previous,
  });
}
