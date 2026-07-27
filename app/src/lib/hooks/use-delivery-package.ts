import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { createMutationIdempotency } from "@/lib/hooks/mutation-idempotency";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";

export function useCreateDeliveryPackage() {
  const queryClient = useQueryClient();
  // Keep key until success so a lost response + user retry stays one settlement.
  const idempotencyRef = useRef(createMutationIdempotency());

  return useMutation({
    retry: 0,
    mutationFn: async ({
      derivationId,
      formats,
    }: {
      derivationId: string;
      formats: DeliveryFormat[];
    }) => {
      const res = await apiFetch(
        `/api/derivations/${derivationId}/delivery-package`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyRef.current.current(),
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
    onSuccess: () => {
      idempotencyRef.current.rotateAfterSuccess();
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void invalidateCanonicalWorks(queryClient);
    },
  });
}
