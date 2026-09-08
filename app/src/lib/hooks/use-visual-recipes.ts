"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { CATALOG_PAGE_DEFAULT_LIMIT } from "@/lib/catalog-page";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import type { VisualRecipeDocument } from "@/server/creative-work/visual-recipe";

export type VisualRecipeListItem = {
  id: string;
  version: number;
  clientProfileId: string;
  originWorkId: string;
  originOutputId: string;
  document: VisualRecipeDocument;
};

async function readError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return new Error(payload.error ?? "Falha ao usar a receita visual");
}

export function useVisualRecipes(clientProfileId: string | null) {
  const query = useInfiniteQuery({
    queryKey: ["creative-work", "recipes", clientProfileId],
    enabled: Boolean(clientProfileId),
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      const response = await apiFetch(
        `/api/creative-work?view=recipes&clientProfileId=${encodeURIComponent(clientProfileId ?? "")}&limit=${CATALOG_PAGE_DEFAULT_LIMIT}${cursor}`,
      );
      if (!response.ok) throw new Error("Falha ao carregar receitas visuais");
      const payload = await response.json() as {
        recipes?: VisualRecipeListItem[];
        nextCursor?: string | null;
      };
      return {
        recipes: payload.recipes ?? [],
        nextCursor: payload.nextCursor ?? null,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.recipes) ?? [],
  };
}

export function useInstantiateVisualRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientProfileId: string;
      draftKey: string;
      recipeId: string;
      fields?: { headline?: string; body?: string; cta?: string };
    }) => {
      const response = await apiFetch("/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw await readError(response);
      return response.json() as Promise<{
        work: { id: string };
        recipeVersion: number;
      }>;
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-work"] }),
        queryClient.invalidateQueries({ queryKey: ["creative-work", data.work.id] }),
        queryClient.invalidateQueries({ queryKey: ["creative-work", "recipes"] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}
