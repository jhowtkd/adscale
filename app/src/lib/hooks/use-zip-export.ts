import { apiFetch } from "@/lib/api-client";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export interface ZipExportPayload {
  derivationIds: string[];
}

export function useZipExport() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation<Blob, Error, ZipExportPayload>({
    mutationFn: async (payload) => {
      const res = await apiFetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("exportFailed"));
      }
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adscale-derivations-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast("success", t("zipDownloadReady"));
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("exportFailed")
      );
    },
  });
}
