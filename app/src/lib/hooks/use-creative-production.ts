"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { CreativeProductionKind, CreativeProductionPage } from "@/lib/creative-production";

export const creativeProductionKey = (
  workspaceId: string | null,
  clientProfileId: string | null,
  campaignId: string | null,
  kinds?: readonly CreativeProductionKind[],
) => ["creative-work", "production", workspaceId, clientProfileId, campaignId, ...(kinds ? [kinds] : [])] as const;

export function useCreativeProduction(input: {
  workspaceId: string | null;
  clientProfileId: string | null;
  campaignId: string | null;
  enabled: boolean;
  isProducing: boolean;
  kinds?: readonly CreativeProductionKind[];
}) {
  const { workspaceId, clientProfileId, campaignId, isProducing, kinds } = input;
  const enabled = input.enabled && Boolean(workspaceId && clientProfileId);
  const query = useInfiniteQuery({
    queryKey: creativeProductionKey(workspaceId, clientProfileId, campaignId, kinds),
    enabled,
    staleTime: 0,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<CreativeProductionPage> => {
      const params = new URLSearchParams({
        view: "production",
        clientProfileId: clientProfileId!,
        limit: "24",
      });
      if (kinds) params.set("kinds", kinds.join(","));
      if (campaignId) params.set("campaignId", campaignId);
      if (pageParam) params.set("cursor", pageParam);
      const response = await apiFetch(`/api/creative-work?${params}`, { signal });
      if (!response.ok) throw new Error("Falha ao carregar produção");
      return response.json();
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: enabled && isProducing ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const { refetch } = query;
  const wasProducing = useRef(isProducing);
  useEffect(() => {
    // Generation transitions refresh immediately; mounting is handled by the query.
    if (enabled && wasProducing.current !== isProducing) void refetch();
    wasProducing.current = isProducing;
  }, [enabled, isProducing, refetch]);
  return { ...query, items: query.data?.pages.flatMap((page) => page.production) ?? [] };
}
