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
  const res = await fetch("/api/dashboard");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch dashboard");
  }
  return res.json();
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });
}
