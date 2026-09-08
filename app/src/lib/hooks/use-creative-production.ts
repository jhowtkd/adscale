"use client";

import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { CreativeProductionPage } from "@/lib/creative-production";

export const creativeProductionKey = (
  workspaceId: string | null,
  clientProfileId: string | null,
  campaignId: string | null,
) => ["creative-work", "production", workspaceId, clientProfileId, campaignId] as const;

export function useCreativeProduction(input: {
  workspaceId: string | null;
  clientProfileId: string | null;
  campaignId: string | null;
  enabled: boolean;
  isProducing: boolean;
}) {
  const { workspaceId, clientProfileId, campaignId, isProducing } = input;
  const enabled = input.enabled && Boolean(workspaceId && clientProfileId);
  const query = useInfiniteQuery({
    queryKey: creativeProductionKey(workspaceId, clientProfileId, campaignId),
    enabled,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<CreativeProductionPage> => {
      const params = new URLSearchParams({
        view: "production",
        clientProfileId: clientProfileId!,
        limit: "24",
      });
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
  useEffect(() => {
    if (enabled) void refetch();
  }, [enabled, workspaceId, clientProfileId, campaignId, isProducing, refetch]);
  return { ...query, items: query.data?.pages.flatMap((page) => page.production) ?? [] };
}
