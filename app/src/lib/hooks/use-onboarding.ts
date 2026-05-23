"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useOnboarding() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: async () => {
      const res = await fetch("/api/user/onboarding", {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("Failed to fetch onboarding status");
      return res.json() as Promise<{ completed: boolean }>;
    },
    staleTime: Infinity,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("Failed to complete onboarding");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["onboarding-status"], { completed: true });
    },
  });

  return {
    completed: data?.completed ?? true, // default to true if loading/error to avoid showing tour
    isLoading,
    complete: completeMutation.mutate,
    isCompleting: completeMutation.isPending,
  };
}
