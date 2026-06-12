import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { LearningEvidenceRef } from "@/server/performance/learning/types";
import type {
  NextExperimentPrefill,
  NextExperimentRecommendation,
  RecommendationEvidenceSummary,
  RecommendationStatus,
} from "@/server/performance/recommendation/types";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

export interface NextExperimentRecommendationResponse {
  status: RecommendationStatus;
  recommendation: NextExperimentRecommendation | null;
}

export type {
  NextExperimentPrefill,
  NextExperimentRecommendation,
  RecommendationEvidenceSummary,
  LearningEvidenceRef,
};

export function useNextExperimentRecommendation(campaignId: string) {
  return useQuery({
    queryKey: ["next-experiment-recommendation", campaignId],
    queryFn: async () => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/recommendation`);
      return parseJsonResponse<NextExperimentRecommendationResponse>(res);
    },
    enabled: Boolean(campaignId),
  });
}

export function recommendationDismissStorageKey(
  campaignId: string,
  recommendationId: string
): string {
  return `next-experiment-dismissed:${campaignId}:${recommendationId}`;
}
