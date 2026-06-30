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

const PREFLIGHT_POLL_INTERVAL_MS = 3_000;
const PREFLIGHT_POLL_TIMEOUT_MS = 120_000;

async function waitForPreflightCompletion(
  campaignId: string,
  assetId: string
): Promise<PreflightResponse> {
  const deadline = Date.now() + PREFLIGHT_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await fetchPreflight(campaignId, assetId);
    if (result.status === "completed") return result;
    if (result.status === "failed") {
      throw new Error("Preflight analysis failed");
    }
    await new Promise((resolve) => setTimeout(resolve, PREFLIGHT_POLL_INTERVAL_MS));
  }

  throw new Error("Preflight analysis timed out");
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
    timeoutMs: PREFLIGHT_POLL_TIMEOUT_MS,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    if (res.status === 429 && err.code === "analysisInProgress") {
      return waitForPreflightCompletion(campaignId, assetId);
    }
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
    refetchInterval: (query) =>
      query.state.data?.status === "analyzing" ? PREFLIGHT_POLL_INTERVAL_MS : false,
  });
}

async function overrideReadinessBlock(
  campaignId: string,
  assetId: string
): Promise<PreflightResponse> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/assets/${assetId}/preflight`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Readiness override failed");
  }
  return res.json() as Promise<PreflightResponse>;
}

export function useReadinessOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      assetId,
    }: {
      campaignId: string;
      assetId: string;
    }) => overrideReadinessBlock(campaignId, assetId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["preflight", variables.campaignId, variables.assetId],
      });
    },
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
