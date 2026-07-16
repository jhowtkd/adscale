import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";

export function useCreateDeliveryPackage() {
  const queryClient = useQueryClient();

  return useMutation({
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
          headers: { "Content-Type": "application/json" },
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
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void invalidateCanonicalWorks(queryClient);
    },
  });
}
