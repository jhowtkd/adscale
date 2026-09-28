import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/**
 * Whether the session user is internal Equipe staff. Probes the
 * cross-account pipeline: it answers 200 for any active staff row (the
 * guard runs before any read) and 401/403 otherwise. Cached for the
 * session — pages fetch their own fresh data.
 */
export function useEquipeStaffAccess() {
  return useQuery({
    queryKey: ["equipe-staff-access"],
    queryFn: async () => {
      const response = await apiFetch("/api/equipe/staff/accounts");
      if (response.status === 401 || response.status === 403) return { allowed: false };
      if (!response.ok) throw new Error("Could not verify equipe staff access");
      return { allowed: true };
    },
    retry: false,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
