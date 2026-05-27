"use client";

import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchCampaigns() {
  const res = await apiFetch("/api/campaigns");
  if (!res.ok) throw new Error("Failed to fetch campaigns");
  return res.json();
}

async function fetchCampaign(id: string) {
  const res = await apiFetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error("Failed to fetch campaign");
  return res.json();
}

export function usePrefetchCampaigns() {
  const queryClient = useQueryClient();

  return {
    prefetch: () => {
      queryClient.prefetchQuery({
        queryKey: ["campaigns", {}],
        queryFn: fetchCampaigns,
        staleTime: 60 * 1000,
      });
    },
  };
}

export function usePrefetchCampaign() {
  const queryClient = useQueryClient();

  return {
    prefetch: (id: string) => {
      if (!id || id === "new") return;
      queryClient.prefetchQuery({
        queryKey: ["campaigns", id],
        queryFn: () => fetchCampaign(id),
        staleTime: 60 * 1000,
      });
    },
  };
}
