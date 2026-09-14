"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function pieceFavoriteQueryKey(workId: string, outputId: string, userId?: string) {
  return ["piece-favorite", userId, workId, outputId] as const;
}

export function libraryFavoritesQueryKey(userId?: string) {
  return ["library-favorites", userId] as const;
}

export function usePieceFavorite(workId: string, outputId: string, enabled: boolean) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const mutation = useSetPieceFavorite();
  const query = useQuery({
    queryKey: pieceFavoriteQueryKey(workId, outputId, userId),
    enabled: enabled && Boolean(userId && workId && outputId),
    queryFn: async () => {
      const response = await apiFetch(`/api/creative-work/${workId}/outputs/${outputId}/favorite`);
      const payload = await response.json().catch(() => ({})) as { favorite?: boolean };
      if (!response.ok) {
        throw new Error("Falha ao consultar favorito");
      }
      return Boolean(payload.favorite);
    },
  });

  return {
    isFavorite: query.data === true,
    isPending: !userId || query.isLoading || mutation.isPending,
    isError: query.isError || mutation.isError,
    toggle: () => {
      if (!userId) return;
      if (query.isError) { void query.refetch(); return; }
      mutation.mutate({ workId, outputId, next: query.data !== true });
    },
  };
}

export function useSetPieceFavorite() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const t = useTranslations("common");
  return useMutation({
    mutationFn: async ({ workId, outputId, next }: { workId: string; outputId: string; next: boolean }) => {
      if (!userId) throw new Error("Unauthorized");
      const response = await apiFetch(
        `/api/creative-work/${workId}/outputs/${outputId}/favorite`,
        { method: next ? "PUT" : "DELETE" },
      );
      const payload = await response.json().catch(() => ({})) as { favorite?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao atualizar favorito");
      }
      return { favorite: Boolean(payload.favorite), userId };
    },
    onSuccess: ({ favorite, userId: ownerId }, { workId, outputId }) => {
      queryClient.setQueryData(pieceFavoriteQueryKey(workId, outputId, ownerId), favorite);
      void queryClient.invalidateQueries({ queryKey: libraryFavoritesQueryKey(ownerId) });
    },
    onError: () => toast.error(t("error")),
  });
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
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: libraryFavoritesQueryKey(userId),
    enabled: enabled && Boolean(userId),
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
