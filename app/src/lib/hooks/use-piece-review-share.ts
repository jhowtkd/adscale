"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useSharePieceReview() {
  return useMutation({
    mutationFn: async (input: { workId: string; outputId: string }) => {
      const response = await apiFetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => ({})) as {
        shareUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.shareUrl) {
        throw new Error(payload.error ?? "Falha ao criar o link de revisão");
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.shareUrl);
      }
      return payload.shareUrl;
    },
  });
}
