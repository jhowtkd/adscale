import { apiFetch } from "@/lib/api-client";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export interface ShareLinkPayload {
  campaignId: string;
  derivationIds: string[];
}

export interface ShareLinkResponse {
  shareUrl: string;
  expiresAt: string;
}

export function useShareLink() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation<ShareLinkResponse, Error, ShareLinkPayload>({
    mutationFn: async (payload) => {
      const res = await apiFetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("shareLinkFailed"));
      }
      return res.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.shareUrl).catch(() => null);
      addToast("success", t("shareLinkCopied"));
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("shareLinkFailed")
      );
    },
  });
}
