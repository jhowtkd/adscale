"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function pieceFavoriteQueryKey(workId: string, outputId: string) {
  return ["piece-favorite", workId, outputId] as const;
}

export function libraryFavoritesQueryKey() {
  return ["library-favorites"] as const;
}

export function usePieceFavorite(workId: string, outputId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: pieceFavoriteQueryKey(workId, outputId),
    enabled: enabled && Boolean(workId && outputId),
    queryFn: async () => {
      const response = await apiFetch(`/api/creative-work/${workId}/outputs/${outputId}/favorite`);
      const payload = await response.json().catch(() => ({})) as { favorite?: boolean };
      if (!response.ok) {
        throw new Error("Falha ao consultar favorito");
      }
      return Boolean(payload.favorite);
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const response = await apiFetch(
        `/api/creative-work/${workId}/outputs/${outputId}/favorite`,
        { method: next ? "PUT" : "DELETE" },
      );
      const payload = await response.json().catch(() => ({})) as { favorite?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao atualizar favorito");
      }
      return Boolean(payload.favorite);
    },
    onSuccess: (favorite) => {
      queryClient.setQueryData(pieceFavoriteQueryKey(workId, outputId), favorite);
      void queryClient.invalidateQueries({ queryKey: libraryFavoritesQueryKey() });
    },
  });

  return {
    isFavorite: query.data === true,
    isPending: query.isPending || mutation.isPending,
    toggle: () => mutation.mutate(!(query.data === true)),
  };
}

export type LibraryFavoriteItem = {
  id: string;
  outputId: string;
  workItemId: string;
  name: string;
  createdAt: string;
  downloadHref: string;
};

export function useLibraryFavorites(enabled: boolean) {
  return useQuery({
    queryKey: libraryFavoritesQueryKey(),
    enabled,
    queryFn: async (): Promise<LibraryFavoriteItem[]> => {
      const response = await apiFetch("/api/library/favorites");
      const payload = await response.json().catch(() => ({})) as { items?: LibraryFavoriteItem[] };
      if (!response.ok) {
        throw new Error("Falha ao carregar favoritos");
      }
      return payload.items ?? [];
    },
  });
}
