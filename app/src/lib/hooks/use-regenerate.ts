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
  // Keep key only across transport loss; any Response ends the attempt.
  const idempotencyRef = useRef(createMutationIdempotency());

  return useMutation({
    retry: 0,
    mutationFn: async (payload?: { feedback?: string; id?: string }) => {
      const targetId = payload?.id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      const key = idempotencyRef.current.current();
      let res: Response;
      try {
        res = await apiFetch(`/api/derivations/${targetId}/regenerate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({ feedback: payload?.feedback }),
        });
      } catch (error) {
        // No Response — keep key for retry after lost connection.
        throw error;
      }
      // Confirmed Response (2xx or 5xx body) ends this attempt.
      idempotencyRef.current.rotateAfterResponse();
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
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast(
        "error",
        err instanceof Error ? err.message : t("regenerationFailed")
      );
    },
  });
}
