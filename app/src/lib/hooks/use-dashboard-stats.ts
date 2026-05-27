"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import type { DashboardStats } from "@/server/repositories/dashboard";

async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await apiFetch("/api/dashboard/stats");
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: fetchDashboardStats,
    staleTime: STALE_TIME.DYNAMIC,
  });
}
