import { apiFetch } from "@/lib/api-client";
import { createMutationIdempotency } from "@/lib/hooks/mutation-idempotency";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useAppStore } from "@/lib/store";

export function useRegenerateDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");
  // Keep key until success so a lost response + user retry stays one settlement.
  const idempotencyRef = useRef(createMutationIdempotency());

  return useMutation({
    retry: 0,
    mutationFn: async (payload?: { feedback?: string; id?: string }) => {
      const targetId = payload?.id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      const res = await apiFetch(`/api/derivations/${targetId}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyRef.current.current(),
        },
        body: JSON.stringify({ feedback: payload?.feedback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("regenerationFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      idempotencyRef.current.rotateAfterSuccess();
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
