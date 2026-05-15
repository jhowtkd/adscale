import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CreativeDiagnosisData {
  detectedConcept: string;
  elementsToPreserve: string[];
  variationOpportunities: string[];
}

export function useGenerateCreativeDiagnosis(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ diagnosis: CreativeDiagnosisData; source: string }> => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/diagnosis`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Creative diagnosis failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
    },
  });
}

export function useUpdateCreativeDiagnosis(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (diagnosis: CreativeDiagnosisData): Promise<{ campaign: unknown }> => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/diagnosis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update diagnosis failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
    },
  });
}

export function useRegenerateCreativeDiagnosis(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ diagnosis: CreativeDiagnosisData; source: string }> => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/diagnosis/regenerate`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Regenerate diagnosis failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
    },
  });
}
