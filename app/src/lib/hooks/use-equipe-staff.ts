import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/**
 * Whether the session user is internal Equipe staff. Asks the cross-account
 * pipeline route for its access answer only (`?access=1`): 200 {allowed} for
 * any signed-in person, so a regular account's shell never logs a 403 (ticket
 * 13, D-11). A 401/403 from an older server still reads as "not staff".
 * Cached for the session — pages fetch their own fresh data.
 */
export function useEquipeStaffAccess() {
  return useQuery({
    queryKey: ["equipe-staff-access"],
    queryFn: async () => {
      const response = await apiFetch("/api/equipe/staff/accounts?access=1");
      if (response.status === 401 || response.status === 403) return { allowed: false };
      if (!response.ok) throw new Error("Could not verify equipe staff access");
      return { allowed: ((await response.json()) as { allowed?: unknown }).allowed === true };
    },
    retry: false,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
