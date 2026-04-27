import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Derivation {
  id: string;
  campaignId: string;
  workspaceId: string;
  planId: string | null;
  parentId: string | null;
  status: string;
  prompt: string | null;
  outputKey: string | null;
  imageUrl: string | null;
  format: string | null;
  cost: number | null;
  feedback: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function fetchDerivations(campaignId: string): Promise<Derivation[]> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/derivations`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar derivações");
  }
  const data = await res.json();
  return (data.derivations as Derivation[]).map((d) => ({
    ...d,
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
  }));
}

async function createDerivations(
  campaignId: string,
  count?: number
): Promise<Derivation[]> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/derivations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar derivações");
  }
  const data = await res.json();
  return data.derivations as Derivation[];
}

export function useDerivations(campaignId: string) {
  return useQuery({
    queryKey: ["derivations", campaignId],
    queryFn: () => fetchDerivations(campaignId),
    enabled: !!campaignId && campaignId !== "new",
    refetchInterval: (query) => {
      const data = query.state.data as Derivation[] | undefined;
      if (
        data?.some(
          (d) => d.status === "queued" || d.status === "processing"
        )
      ) {
        return 3000;
      }
      return false;
    },
  });
}

export function useCreateDerivations(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (count?: number) => createDerivations(campaignId, count),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["derivations", campaignId],
      });
    },
  });
}
