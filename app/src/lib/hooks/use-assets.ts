import { apiFetch } from "@/lib/api-client";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

export interface Asset {
  id: string;
  campaignId: string;
  workspaceId: string;
  key: string;
  type: string;
  role?: string;
  size: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export interface AssetWithUrl extends Asset {
  url: string;
}

interface UploadAssetInput {
  file: File;
  width?: number;
  height?: number;
  role?: string;
  onProgress?: (progress: number) => void;
}

async function uploadAssetToBackend(
  campaignId: string,
  file: File,
  width?: number,
  height?: number,
  role?: string,
  onProgress?: (progress: number) => void
): Promise<Asset> {
  if (!campaignId || campaignId === "new") {
    throw new Error("Aguarde a campanha ser criada antes de fazer upload.");
  }

  const formData = new FormData();
  formData.append("file", file);
  if (width !== undefined) formData.append("width", String(width));
  if (height !== undefined) formData.append("height", String(height));
  if (role !== undefined) formData.append("role", role);

  const res = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/campaigns/${campaignId}/assets/upload`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: new Headers({
            "content-type": xhr.getResponseHeader("content-type") ?? "application/json",
          }),
        })
      );
    };

    xhr.onerror = () => reject(new Error("Falha no upload"));
    xhr.send(formData);
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao salvar asset");
  }
  const data = await res.json();
  const a = data.asset as Asset;
  return {
    ...a,
    createdAt: new Date(a.createdAt),
  };
}

/** One page of `GET /api/campaigns/[id]/assets` (#503). */
export type CampaignAssetsPage = {
  assets: AssetWithUrl[];
  nextCursor: string | null;
  /** First page only: newest `base` material of the Campanha. */
  featured: { base: AssetWithUrl | null } | null;
  /** First page only: every material of the Campanha. */
  total: number | null;
};

type CampaignAssetsResponse = {
  assets?: Asset[];
  nextCursor?: string | null;
  featured?: { base: Asset | null };
  total?: number;
};

function withDate(asset: Asset): AssetWithUrl {
  return { ...asset, createdAt: new Date(asset.createdAt) } as AssetWithUrl;
}

async function requestCampaignAssets(path: string): Promise<CampaignAssetsResponse> {
  const res = await apiFetch(path);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar assets");
  }

  return (await res.json()) as CampaignAssetsResponse;
}

async function fetchCampaignAssetsPage(
  campaignId: string,
  cursor: string | null
): Promise<CampaignAssetsPage> {
  const path = `/api/campaigns/${campaignId}/assets`;
  const data = await requestCampaignAssets(
    cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path
  );
  return {
    assets: (data.assets ?? []).map(withDate),
    nextCursor: data.nextCursor ?? null,
    featured: data.featured
      ? { base: data.featured.base ? withDate(data.featured.base) : null }
      : null,
    total: data.total ?? null,
  };
}

export function useUploadAsset(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, width, height, role, onProgress }: UploadAssetInput) => {
      return uploadAssetToBackend(campaignId, file, width, height, role, onProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-assets", campaignId] });
    },
  });
}

/**
 * Materials of a Campanha, one keyset page at a time (#503). `data` is the
 * loaded pages, newest first; `featured` and `total` cover every material.
 */
export function useCampaignAssets(campaignId: string) {
  const query = useInfiniteQuery({
    queryKey: ["campaign-assets", campaignId],
    queryFn: ({ pageParam }) => fetchCampaignAssetsPage(campaignId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!campaignId && campaignId !== "new",
  });
  const pages = query.data?.pages;
  const assets = useMemo(() => {
    if (!pages) return undefined;
    const byId = new Map<string, AssetWithUrl>();
    for (const page of pages) {
      for (const asset of page.assets) if (!byId.has(asset.id)) byId.set(asset.id, asset);
    }
    return [...byId.values()];
  }, [pages]);

  return {
    ...query,
    data: assets,
    featured: pages?.[0]?.featured ?? null,
    total: pages?.[0]?.total ?? null,
  };
}
