import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";

export function useReviewDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);

  return useMutation({
    mutationFn: async ({
      status,
      id,
    }: {
      status: "approved" | "rejected";
      id?: string;
    }) => {
      const targetId = id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      const res = await apiFetch(`/api/derivations/${targetId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast(
        "success",
        `Derivation ${variables.status === "approved" ? "approved" : "rejected"}`
      );
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : "Failed to update status"
      );
    },
  });
}
