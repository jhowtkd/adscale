"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type PieceReviewShareResult = {
  shareUrl: string;
  copied: boolean;
};

export async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function useSharePieceReview() {
  return useMutation({
    mutationFn: async (input: { workId: string; outputId: string }): Promise<PieceReviewShareResult> => {
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
      const copied = await copyTextToClipboard(payload.shareUrl);
      return { shareUrl: payload.shareUrl, copied };
    },
  });
}
