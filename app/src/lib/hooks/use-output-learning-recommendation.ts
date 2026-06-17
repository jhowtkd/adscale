import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { OutputLearningEvidenceRef } from "@/server/output-learning/types";
import type {
  OutputAvoidPatternHint,
  OutputGenerationPrefill,
  OutputLearningRecommendation,
  OutputRecommendationEvidenceSummary,
  OutputRecommendationStatus,
} from "@/server/output-learning/recommendation/types";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

export interface OutputLearningRecommendationResponse {
  status: OutputRecommendationStatus;
  recommendation: OutputLearningRecommendation | null;
}

export type {
  OutputAvoidPatternHint,
  OutputGenerationPrefill,
  OutputLearningRecommendation,
  OutputLearningEvidenceRef,
  OutputRecommendationEvidenceSummary,
};

export function useOutputLearningRecommendation(
  campaignId: string,
  options?: { generationMode?: string; format?: string; enabled?: boolean }
) {
  const query = new URLSearchParams();
  if (options?.generationMode) query.set("generationMode", options.generationMode);
  if (options?.format) query.set("format", options.format);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  return useQuery({
    queryKey: [
      "output-learning-recommendation",
      campaignId,
      options?.generationMode ?? null,
      options?.format ?? null,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/output-recommendation${suffix}`
      );
      return parseJsonResponse<OutputLearningRecommendationResponse>(res);
    },
    enabled: options?.enabled ?? Boolean(campaignId),
  });
}

export function outputRecommendationDismissStorageKey(
  campaignId: string,
  recommendationId: string
): string {
  return `output-learning-dismissed:${campaignId}:${recommendationId}`;
}
