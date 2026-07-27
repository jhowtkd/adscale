import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";

export function useCreateDeliveryPackage() {
  const queryClient = useQueryClient();
  // One key per mutate() attempt so retries of the same click stay idempotent.
  const attemptKeyRef = useRef<string | null>(null);

  return useMutation({
    retry: 0,
    mutationFn: async ({
      derivationId,
      formats,
    }: {
      derivationId: string;
      formats: DeliveryFormat[];
    }) => {
      attemptKeyRef.current ??= crypto.randomUUID();
      const res = await apiFetch(
        `/api/derivations/${derivationId}/delivery-package`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": attemptKeyRef.current,
          },
          body: JSON.stringify({ formats }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao gerar pacote de entrega");
      }
      return res.json();
    },
    onSettled: () => {
      attemptKeyRef.current = null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void invalidateCanonicalWorks(queryClient);
    },
  });
}
