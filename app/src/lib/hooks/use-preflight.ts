import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PreflightResult } from "@/server/ai/preflight-analysis";
import type { CreativeReadinessResult } from "@/server/ai/creative-readiness";

export interface PreflightResponse {
  preflight: PreflightResult | null;
  readiness: CreativeReadinessResult | null;
  status: "pending" | "analyzing" | "completed" | "failed";
  analyzedAt?: string;
  cached?: boolean;
}

async function fetchPreflight(campaignId: string, assetId: string): Promise<PreflightResponse> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/assets/${assetId}/preflight`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load preflight analysis");
  }
  return res.json() as Promise<PreflightResponse>;
}

async function analyzePreflight(
  campaignId: string,
  assetId: string,
  options?: { force?: boolean }
): Promise<PreflightResponse> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/assets/${assetId}/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options?.force ? { force: true } : {}),
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Preflight analysis failed");
  }
  return res.json() as Promise<PreflightResponse>;
}

export function usePreflightScore({
  campaignId,
  assetId,
}: {
  campaignId: string | null | undefined;
  assetId: string | null | undefined;
}) {
  return useQuery({
    queryKey: ["preflight", campaignId, assetId],
    queryFn: () => {
      if (!campaignId || !assetId) {
        throw new Error("campaignId and assetId are required");
      }
      return fetchPreflight(campaignId, assetId);
    },
    enabled: !!campaignId && !!assetId && campaignId !== "new",
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnalyzePreflight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      assetId,
      force,
    }: {
      campaignId: string;
      assetId: string;
      force?: boolean;
    }) => {
      return analyzePreflight(campaignId, assetId, { force });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["preflight", variables.campaignId, variables.assetId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-assets", variables.campaignId] });
    },
  });
}
