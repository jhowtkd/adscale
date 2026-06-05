import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApprovalPackageSnapshot } from "@/server/ai/client-approval-package";

export type ApprovalPackageRoot = {
  id: string;
  format?: string | null;
  ctaText?: string | null;
  variantIndex?: number | null;
};

export type ApprovalPackageResponse = {
  campaignId: string;
  availableRoots: ApprovalPackageRoot[];
  selectedRootIds: string[];
  package: ApprovalPackageSnapshot;
  shareUrl: string | null;
  expiresAt: string | null;
};

export function useApprovalPackage(campaignId: string, enabled = true) {
  return useQuery({
    queryKey: ["approval-package", campaignId],
    enabled: enabled && Boolean(campaignId),
    queryFn: async () => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/approval-package`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load approval package");
      }
      return res.json() as Promise<ApprovalPackageResponse>;
    },
  });
}

export function useSaveApprovalPackage(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      derivationIds,
      notes,
    }: {
      derivationIds: string[];
      notes?: string;
    }) => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/approval-package`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ derivationIds, notes }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save approval package");
      }
      return res.json() as Promise<ApprovalPackageResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-package", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
    },
  });
}
