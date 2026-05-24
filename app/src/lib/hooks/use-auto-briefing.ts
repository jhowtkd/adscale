import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export interface AutoBriefingResult {
  extracted: {
    client: string;
    product: string | null;
    offer: string;
    objective: string;
    audience: string;
    ctaText: string;
    constraints: string;
  };
  confidence: {
    client: number;
    offer: number;
    ctaText: number;
    audience: number;
  };
}

export function useAutoBriefing(campaignId: string) {
  return useMutation<AutoBriefingResult, Error, string>({
    mutationFn: async (imageKey: string) => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/auto-briefing`, {
        method: "POST",
        body: JSON.stringify({ imageKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Auto-briefing analysis failed");
      }
      return res.json() as Promise<AutoBriefingResult>;
    },
  });
}
