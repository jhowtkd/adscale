"use client";

import { apiFetch } from "@/lib/api-client";
import { CATALOG_PAGE_DEFAULT_LIMIT } from "@/lib/catalog-page";
import { STALE_TIME } from "@/lib/query-config";
import { useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

export const CANONICAL_WORKS_QUERY_KEY = ["canonical-works"] as const;
const ACTIVE_STATES = new Set<CanonicalWorkSummary["state"]>([
  "intending",
  "briefing",
  "generating",
]);

export function canonicalWorksRefetchInterval(
  works: readonly CanonicalWorkSummary[] | undefined,
): number | false {
  return works?.some((work) => ACTIVE_STATES.has(work.state)) ? 5_000 : false;
}

type CanonicalWorksPage = {
  works: CanonicalWorkSummary[];
  nextCursor: string | null;
};

async function fetchCanonicalWorks(cursor: string | null): Promise<CanonicalWorksPage> {
  const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  const res = await apiFetch(`/api/creative-work?limit=${CATALOG_PAGE_DEFAULT_LIMIT}${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.error === "string" ? err.error : "Erro ao carregar trabalhos"
    );
  }
  const data = (await res.json()) as {
    works?: CanonicalWorkSummary[];
    nextCursor?: string | null;
  };
  return { works: data.works ?? [], nextCursor: data.nextCursor ?? null };
}

/** Invalidate home / sidebar / Trabalhos list after campaign or creative_work changes. */
export function invalidateCanonicalWorks(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: CANONICAL_WORKS_QUERY_KEY });
}

/**
 * Shared projection invalidation: campaign lists, dashboard stats, and the
 * canonical works feed used by Phase 6 home/nav/Trabalhos.
 */
export function invalidateWorkListProjections(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    invalidateCanonicalWorks(queryClient),
  ]);
}

/**
 * Phase 6: shared list for home + sidebar (campaign + creative_work).
 * Cursor-paged; `data` is the flattened list of loaded pages.
 */
export function useCanonicalWorks() {
  const query = useInfiniteQuery({
    queryKey: CANONICAL_WORKS_QUERY_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchCanonicalWorks(pageParam),
    getNextPageParam: (last) => last.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.works),
    staleTime: STALE_TIME.DYNAMIC,
    refetchInterval: (query) =>
      canonicalWorksRefetchInterval(query.state.data?.pages.flatMap((page) => page.works)),
    refetchIntervalInBackground: false,
  });
  return query;
}
