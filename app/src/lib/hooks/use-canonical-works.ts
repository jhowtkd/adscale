"use client";

import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

export const CANONICAL_WORKS_QUERY_KEY = ["canonical-works"] as const;

async function fetchCanonicalWorks(): Promise<CanonicalWorkSummary[]> {
  const res = await apiFetch("/api/creative-work");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.error === "string" ? err.error : "Erro ao carregar trabalhos"
    );
  }
  const data = (await res.json()) as { works?: CanonicalWorkSummary[] };
  return data.works ?? [];
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

/** Phase 6: shared list for home + sidebar (campaign + creative_work). */
export function useCanonicalWorks() {
  return useQuery({
    queryKey: CANONICAL_WORKS_QUERY_KEY,
    queryFn: fetchCanonicalWorks,
    staleTime: STALE_TIME.DYNAMIC,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
