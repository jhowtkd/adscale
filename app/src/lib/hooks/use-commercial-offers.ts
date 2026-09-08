"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { CATALOG_PAGE_DEFAULT_LIMIT } from "@/lib/catalog-page";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import type { CommercialOfferDocument } from "@/server/creative-work/commercial-offer";

export type CommercialOfferListItem = {
  id: string;
  version: number;
  clientProfileId: string;
  originWorkId: string;
  document: CommercialOfferDocument;
  validFrom: string;
  validUntil: string;
};

async function readError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return new Error(payload.error ?? "Falha ao usar a oferta comercial");
}

export function useCommercialOffers(clientProfileId: string | null) {
  const query = useInfiniteQuery({
    queryKey: ["creative-work", "offers", clientProfileId],
    enabled: Boolean(clientProfileId),
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      const response = await apiFetch(
        `/api/creative-work?view=offers&clientProfileId=${encodeURIComponent(clientProfileId ?? "")}&limit=${CATALOG_PAGE_DEFAULT_LIMIT}${cursor}`,
      );
      if (!response.ok) throw new Error("Falha ao carregar ofertas da marca");
      const payload = await response.json() as {
        offers?: CommercialOfferListItem[];
        nextCursor?: string | null;
      };
      return {
        offers: payload.offers ?? [],
        nextCursor: payload.nextCursor ?? null,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.offers) ?? [],
  };
}

export function useInstantiateCommercialOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientProfileId: string;
      draftKey: string;
      offerId: string;
    }) => {
      const response = await apiFetch("/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw await readError(response);
      return response.json() as Promise<{
        work: { id: string };
        offerVersion: number;
      }>;
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-work"] }),
        queryClient.invalidateQueries({ queryKey: ["creative-work", data.work.id] }),
        queryClient.invalidateQueries({ queryKey: ["creative-work", "offers"] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export function useSaveCommercialOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workItemId: string;
      validUntil: string;
      validFrom?: string;
    }) => {
      const response = await apiFetch(`/api/creative-work/${input.workItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveAsOffer",
          validUntil: input.validUntil,
          ...(input.validFrom ? { validFrom: input.validFrom } : {}),
        }),
      });
      if (!response.ok) throw await readError(response);
      return response.json() as Promise<{
        offer: { id: string; version: number; document: CommercialOfferDocument };
      }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["creative-work", "offers"] });
    },
  });
}
