import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export function useRegenerateDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation({
    mutationFn: async (payload?: { feedback?: string; id?: string }) => {
      const targetId = payload?.id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      const res = await apiFetch(`/api/derivations/${targetId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: payload?.feedback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("regenerationFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast("success", t("regenerationQueued"));
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("regenerationFailed")
      );
    },
  });
}
