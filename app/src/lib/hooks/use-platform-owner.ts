import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function usePlatformOwnerAccess() {
  return useQuery({
    queryKey: ["platform-owner-access"],
    queryFn: async () => {
      const response = await apiFetch("/api/feedback/reports?access=1");
      if (response.status === 401 || response.status === 403) return { allowed: false };
      if (!response.ok) throw new Error("Could not verify platform owner access");
      return (await response.json()) as { allowed: boolean };
    },
    retry: false,
  });
}
