import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Plan {
  id: string;
  campaignId: string;
  workspaceId: string;
  strategy: string | null;
  angles: string[] | null;
  hooks: string[] | null;
  ctas: string[] | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

async function fetchPlan(campaignId: string): Promise<Plan | null> {
  const res = await fetch(`/api/campaigns/${campaignId}/plan`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch plan");
  }
  const data = await res.json();
  return data.plan as Plan;
}

async function generatePlan(campaignId: string): Promise<Plan> {
  const res = await fetch(`/api/campaigns/${campaignId}/plan`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate plan");
  }
  const data = await res.json();
  return data.plan as Plan;
}

async function updatePlanStatus(
  campaignId: string,
  status: "approved" | "rejected"
): Promise<Plan> {
  const res = await fetch(`/api/campaigns/${campaignId}/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update plan status");
  }
  const data = await res.json();
  return data.plan as Plan;
}

export function usePlan(campaignId: string) {
  return useQuery({
    queryKey: ["plans", campaignId],
    queryFn: () => fetchPlan(campaignId),
    enabled: !!campaignId && campaignId !== "new",
  });
}

export function useGeneratePlan(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generatePlan(campaignId),
    onSuccess: (data) => {
      queryClient.setQueryData(["plans", campaignId], data);
      queryClient.invalidateQueries({ queryKey: ["plans", campaignId] });
    },
  });
}

export function useUpdatePlanStatus(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      updatePlanStatus(campaignId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans", campaignId] });
    },
  });
}
