import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Asset {
  id: string;
  campaignId: string;
  workspaceId: string;
  key: string;
  type: string;
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
  onProgress?: (progress: number) => void;
}

async function uploadAssetToBackend(
  campaignId: string,
  file: File,
  width?: number,
  height?: number,
  onProgress?: (progress: number) => void
): Promise<Asset> {
  const formData = new FormData();
  formData.append("file", file);
  if (width !== undefined) formData.append("width", String(width));
  if (height !== undefined) formData.append("height", String(height));

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

async function fetchCampaignAssets(campaignId: string): Promise<AssetWithUrl[]> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/assets`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar assets");
  }

  const data = await res.json();
  return (data.assets as Asset[]).map((asset) => ({
    ...asset,
    createdAt: new Date(asset.createdAt),
  })) as AssetWithUrl[];
}

export function useUploadAsset(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, width, height, onProgress }: UploadAssetInput) => {
      return uploadAssetToBackend(campaignId, file, width, height, onProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
    },
  });
}

export function useCampaignAssets(campaignId: string) {
  return useQuery({
    queryKey: ["campaign-assets", campaignId],
    queryFn: () => fetchCampaignAssets(campaignId),
    enabled: !!campaignId && campaignId !== "new",
  });
}
