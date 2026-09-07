"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { CATALOG_PAGE_DEFAULT_LIMIT } from "@/lib/catalog-page";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export function useCreativeInspirations(clientProfileId: string | null) {
  const query = useInfiniteQuery({
    queryKey: ["creative-work", "inspirations", clientProfileId],
    enabled: Boolean(clientProfileId),
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      const response = await apiFetch(
        `/api/creative-work?view=inspirations&clientProfileId=${encodeURIComponent(clientProfileId ?? "")}&limit=${CATALOG_PAGE_DEFAULT_LIMIT}${cursor}`,
      );
      if (!response.ok) throw new Error("Falha ao carregar inspirações");
      const payload = await response.json() as {
        inspirations?: CreativeInspiration[];
        nextCursor?: string | null;
      };
      return {
        inspirations: payload.inspirations ?? [],
        nextCursor: payload.nextCursor ?? null,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.inspirations),
  };
}
