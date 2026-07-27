import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useAppStore } from "@/lib/store";

export function useRegenerateDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");
  // One key per mutate() attempt so retries of the same click stay idempotent.
  const attemptKeyRef = useRef<string | null>(null);

  return useMutation({
    retry: 0,
    mutationFn: async (payload?: { feedback?: string; id?: string }) => {
      const targetId = payload?.id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      attemptKeyRef.current ??= crypto.randomUUID();
      const res = await apiFetch(`/api/derivations/${targetId}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attemptKeyRef.current,
        },
        body: JSON.stringify({ feedback: payload?.feedback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("regenerationFailed"));
      }
      return res.json();
    },
    onSettled: () => {
      attemptKeyRef.current = null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast("success", t("regenerationQueued"));
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast(
        "error",
        err instanceof Error ? err.message : t("regenerationFailed")
      );
    },
  });
}
