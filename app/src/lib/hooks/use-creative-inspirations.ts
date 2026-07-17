"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export function useCreativeInspirations(clientProfileId: string | null) {
  return useQuery({
    queryKey: ["creative-work", "inspirations", clientProfileId],
    enabled: Boolean(clientProfileId),
    staleTime: 30_000,
    queryFn: () => apiFetch(`/api/creative-work?view=inspirations&clientProfileId=${encodeURIComponent(clientProfileId!)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar inspirações");
        const payload = await response.json() as { inspirations?: CreativeInspiration[] };
        return payload.inspirations ?? [];
      }),
  });
}
