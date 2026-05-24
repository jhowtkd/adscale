import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface SmartResizePreview {
  analysis: {
    crops: Record<string, { x: number; y: number; width: number; height: number }>;
    safeZones: Array<{ x: number; y: number; width: number; height: number; label: string }>;
    criticalElements: Array<{ x: number; y: number; width: number; height: number; type: string }>;
  };
  recommendations: Array<{
    platform: string;
    rules: { textMaxPercent: number; safeZones: string[]; notes: string } | null;
    recommendation: string | null;
    compliance: string;
  }>;
  platformRules: Record<string, { textMaxPercent: number; safeZones: string[]; notes: string }>;
}

export function useSmartResizePreview(campaignId: string) {
  return useQuery<SmartResizePreview>({
    queryKey: ["smart-resize-preview", campaignId],
    queryFn: async () => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/smart-resize-preview`);
      if (!res.ok) throw new Error("Failed to load smart resize preview");
      return res.json();
    },
    enabled: Boolean(campaignId),
  });
}
