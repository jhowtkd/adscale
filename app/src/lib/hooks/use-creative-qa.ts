import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreativeQa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ derivationId }: { derivationId: string }) => {
      const res = await apiFetch(`/api/derivations/${derivationId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao revisar QA da arte");
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
