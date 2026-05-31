import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export interface LandingPageResponse {
  landingPage: {
    id: string;
    status: "queued" | "completed" | "failed";
    title: string | null;
    htmlKey: string | null;
  };
  downloadUrl: string;
  expiresAt: string;
}

export function useGenerateLandingPage() {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation<LandingPageResponse, Error, { derivationId: string }>({
    mutationFn: async ({ derivationId }) => {
      const res = await apiFetch(`/api/derivations/${derivationId}/landing-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("landingPageFailed"));
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      window.open(data.downloadUrl, "_blank");
      addToast("success", t("landingPageReady"));
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("landingPageFailed")
      );
    },
  });
}
