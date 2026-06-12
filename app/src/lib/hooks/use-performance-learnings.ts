import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { LearningEvidenceRef } from "@/server/performance/learning/types";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

export interface PerformanceLearning {
  id: string;
  clientProfileId: string;
  variableKey: string;
  variableValue: string;
  primaryMetric: string;
  expectedDirection: "increase" | "decrease" | null;
  statement: string;
  confidence: "low" | "medium" | "high";
  confidenceScore: string;
  sampleImpressions: number;
  sampleCampaignCount: number;
  contextPlatforms: string[];
  contextObjectives: string[];
  supportingEvidence: LearningEvidenceRef[];
  contradictingEvidence: LearningEvidenceRef[];
  algorithmVersion: string;
  status: string;
  lastEvidenceAt: string | null;
  relevance?: number;
}

export const CONFIDENCE_LABELS: Record<PerformanceLearning["confidence"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export function useCampaignLearnings(campaignId: string) {
  return useQuery({
    queryKey: ["campaign-learnings", campaignId],
    queryFn: async () => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/learnings`);
      return parseJsonResponse<{
        source: "mem0" | "postgres";
        learnings: PerformanceLearning[];
        clientProfileId: string | null;
      }>(res);
    },
    enabled: Boolean(campaignId),
  });
}

export function useRecomputeCampaignLearnings(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/learnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recompute" }),
      });
      return parseJsonResponse<{ upsertedCount: number; removedCount: number }>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaign-learnings", campaignId] });
    },
  });
}
