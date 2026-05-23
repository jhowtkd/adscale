import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type ScoreStatus = "pending" | "heuristic" | "analyzed" | "failed";

export interface CreativeScoreBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
  variationLevelFit?: number;
  informationPreservation?: number;
}

export interface Derivation {
  id: string;
  campaignId: string;
  workspaceId: string;
  planId: string | null;
  parentId: string | null;
  status: string;
  prompt: string | null;
  outputKey: string | null;
  imageUrl: string | null;
  format: string | null;
  generationMode: string | null;
  variantIndex: number | null;
  ctaText: string | null;
  cost: number | null;
  feedback: string | null;
  qualityScore?: number | null;
  scoreStatus?: ScoreStatus | null;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  scoreIssues?: string[] | null;
  regenerationSuggestion?: string | null;
  scoredAt?: Date | null;
  qaStatus?: "pending" | "ready" | "warning" | "review" | "failed" | null;
  qaChecklist?: Record<string, { status: string; note: string }> | null;
  qaIssues?: string[] | null;
  qaSuggestions?: string[] | null;
  qaAnalyzedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

async function fetchDerivations(campaignId: string): Promise<Derivation[]> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/derivations`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar derivações");
  }
  const data = await res.json();
  return (data.derivations as Derivation[]).map((d) => ({
    ...d,
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
    scoredAt: d.scoredAt ? new Date(d.scoredAt) : null,
    qaAnalyzedAt: d.qaAnalyzedAt ? new Date(d.qaAnalyzedAt) : null,
  }));
}

async function createDerivations(
  campaignId: string,
  options?: { preview?: boolean }
): Promise<Derivation[]> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/derivations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preview: options?.preview ?? false }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar derivações");
  }
  const data = await res.json();
  return data.derivations as Derivation[];
}

export function useDerivations(campaignId: string) {
  return useQuery({
    queryKey: ["derivations", campaignId],
    queryFn: () => fetchDerivations(campaignId),
    enabled: !!campaignId && campaignId !== "new",
    refetchInterval: (query) => {
      const data = query.state.data as Derivation[] | undefined;
      const hasPending = data?.some(
        (d) =>
          d.status === "queued" ||
          d.status === "processing" ||
          d.scoreStatus === "heuristic" ||
          (d.status === "completed" && d.scoreStatus === "pending")
      );
      if (!hasPending) return false;

      // Progressive backoff based on time since first pending observation
      const pendingSince = query.state.dataUpdatedAt;
      const elapsed = Date.now() - pendingSince;
      if (elapsed < 30000) return 3000;      // First 30s: every 3s
      if (elapsed < 120000) return 5000;     // Next 90s: every 5s
      return 10000;                           // After 2min: every 10s
    },
  });
}

export function useCreateDerivations(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options?: { preview?: boolean }) => createDerivations(campaignId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["derivations", campaignId],
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
