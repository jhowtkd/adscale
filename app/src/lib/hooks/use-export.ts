import { apiFetch } from "@/lib/api-client";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export interface ExportPayload {
  type: "individual" | "batch";
  derivationId?: string;
  campaignId?: string;
  format: "png" | "jpeg" | "webp";
}

export interface ExportResponse {
  downloadUrl: string;
  expiresAt: string;
}

export function useExport() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation<ExportResponse, Error, ExportPayload>({
    mutationFn: async (payload) => {
      const res = await apiFetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("exportFailed"));
      }
      return res.json();
    },
    onSuccess: (data) => {
      window.open(data.downloadUrl, "_blank");
      addToast("success", t("exportReady"));
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("exportFailed")
      );
    },
  });
}
