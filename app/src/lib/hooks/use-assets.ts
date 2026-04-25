import { useMutation, useQueryClient } from "@tanstack/react-query";

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

interface PresignResponse {
  url: string;
  key: string;
}

interface CompletePayload {
  key: string;
  type: string;
  size?: number;
  width?: number;
  height?: number;
}

async function getPresignedUrl(
  campaignId: string,
  file: File
): Promise<PresignResponse> {
  const res = await fetch(`/api/campaigns/${campaignId}/assets/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      contentLength: file.size,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get upload URL");
  }
  return res.json();
}

async function uploadToPresignedUrl(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "Content-Length": String(file.size),
    },
    body: file,
  });
  if (!res.ok) {
    throw new Error("Upload to storage failed");
  }
}

async function completeUpload(
  campaignId: string,
  payload: CompletePayload
): Promise<Asset> {
  const res = await fetch(`/api/campaigns/${campaignId}/assets/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save asset");
  }
  const data = await res.json();
  return data.asset;
}

export function useUploadAsset(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { url, key } = await getPresignedUrl(campaignId, file);
      await uploadToPresignedUrl(url, file);
      const asset = await completeUpload(campaignId, {
        key,
        type: file.type,
        size: file.size,
      });
      return asset;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
    },
  });
}
