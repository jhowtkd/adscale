import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { createMutationIdempotency } from "@/lib/hooks/mutation-idempotency";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";

export function useCreateDeliveryPackage() {
  const queryClient = useQueryClient();
  // Keep key only across transport loss; any Response ends the attempt.
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
      const key = idempotencyRef.current.current();
      let res: Response;
      try {
        res = await apiFetch(
          `/api/derivations/${derivationId}/delivery-package`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({ formats }),
          }
        );
      } catch (error) {
        // No Response — keep key for retry after lost connection.
        throw error;
      }
      // Confirmed Response (2xx or error body) ends this attempt.
      idempotencyRef.current.rotateAfterResponse();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao gerar pacote de entrega");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void invalidateCanonicalWorks(queryClient);
    },
  });
}
