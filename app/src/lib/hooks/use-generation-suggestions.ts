"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CtaSuggestion {
  value: string;
  confidence: "high" | "medium" | "low";
}

export interface CtaSuggestionsResponse {
  suggestions: CtaSuggestion[];
}

export interface CampaignContext {
  product?: string;
  objective?: string;
  targetAudience?: string;
  tone?: string;
  offer?: string;
  platforms?: string[];
}

export function useSuggestCtas(campaignId: string) {
  return useMutation({
    mutationFn: async ({
      campaignContext,
      existingCtas,
    }: {
      campaignContext: CampaignContext;
      existingCtas?: string[];
    }) => {
      const response = await apiFetch(`/api/campaigns/${campaignId}/suggest-ctas`, {
        method: "POST",
        body: JSON.stringify({ campaignContext, existingCtas }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch CTA suggestions");
      }
      return response.json() as Promise<CtaSuggestionsResponse>;
    },
  });
}

export interface CreativeLevelSuggestion {
  suggestedLevel: "conservative" | "balanced" | "bold" | "extreme";
  reasoning: string;
}

export function useSuggestCreativeLevel(campaignId: string) {
  return useQuery({
    queryKey: ["creative-level-suggestion", campaignId],
    queryFn: async () => {
      const response = await apiFetch(`/api/campaigns/${campaignId}/suggest-creative-level`);
      if (!response.ok) {
        throw new Error("Failed to fetch creative level suggestion");
      }
      return response.json() as Promise<CreativeLevelSuggestion>;
    },
    enabled: !!campaignId && campaignId !== "new",
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
