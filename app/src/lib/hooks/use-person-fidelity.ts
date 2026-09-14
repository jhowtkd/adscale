"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type OutputPersonReference = {
  personId: string;
  name: string;
  primaryPhotoUrl: string | null;
  photoUrls: string[];
};

export function outputPersonReferencesQueryKey(workId: string, outputId: string) {
  return ["creative-work", workId, "outputs", outputId, "person-references"] as const;
}

/** Reference photos of the frozen snapshot people, shown beside the output. */
export function useOutputPersonReferences(workId: string, outputId: string, enabled: boolean) {
  return useQuery({
    queryKey: outputPersonReferencesQueryKey(workId, outputId),
    enabled: enabled && Boolean(workId && outputId),
    queryFn: async (): Promise<OutputPersonReference[]> => {
      const response = await apiFetch(`/api/creative-work/${workId}/outputs/${outputId}/person-references`);
      const payload = await response.json().catch(() => ({})) as { people?: OutputPersonReference[] };
      if (!response.ok) throw new Error("Falha ao carregar referências das pessoas");
      return Array.isArray(payload.people) ? payload.people : [];
    },
  });
}

export function useReviewPersonFidelity(workId: string, outputId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: { referenceHash: string; accepted: boolean }) => {
      const response = await apiFetch(`/api/creative-work/${workId}/outputs/${outputId}/select`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_person_fidelity",
          outputId,
          referenceHash: input.referenceHash,
          accepted: input.accepted,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao registrar revisão");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["creative-work", workId] });
    },
  });
  return {
    review: (input: { referenceHash: string; accepted: boolean }) => mutation.mutate(input),
    isPending: mutation.isPending,
    isError: mutation.isError,
    reset: () => mutation.reset(),
  };
}
