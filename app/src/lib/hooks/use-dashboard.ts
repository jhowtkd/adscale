import { apiFetch } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";

export interface DashboardData {
  campaignCount: number;
  recentActivity: Array<{
    id: string;
    type: "plan" | "derivation" | "campaign" | "export" | "alert";
    message: string;
    timestamp: Date;
  }>;
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await apiFetch("/api/dashboard");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch dashboard");
  }
  const data = await res.json();
  return {
    ...data,
    recentActivity: (data.recentActivity ?? []).map((item: DashboardData["recentActivity"][number]) => ({
      ...item,
      timestamp: new Date(item.timestamp),
    })),
  };
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });
}
