"use client";

import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useQuery } from "@tanstack/react-query";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

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

/** Phase 6: shared list for home + sidebar (campaign + creative_work). */
export function useCanonicalWorks() {
  return useQuery({
    queryKey: ["canonical-works"],
    queryFn: fetchCanonicalWorks,
    staleTime: STALE_TIME.DYNAMIC,
  });
}
