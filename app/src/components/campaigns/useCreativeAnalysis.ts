import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { AiDeducedFields } from "@/server/validation/ai-deduction";

interface AnalysisResponse {
  analysis: AiDeducedFields;
  status: "completed" | "failed";
  message?: string;
}

export function useCreativeAnalysis(campaignId: string) {
  const queryClient = useQueryClient();

  const analyzeMutation = useMutation({
    mutationFn: async (assetId: string): Promise<AnalysisResponse> => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
        timeoutMs: 120_000,
      });

      if (!res.ok) {
        // Even on API error, we want to be non-blocking
        return { analysis: {}, status: "failed" };
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate campaign data to reflect new analysis
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-assets", campaignId] });
    },
  });

  return {
    analyze: analyzeMutation.mutateAsync,
    isAnalyzing: analyzeMutation.isPending,
    analysisResult: analyzeMutation.data,
    analysisError: analyzeMutation.error,
  };
}
