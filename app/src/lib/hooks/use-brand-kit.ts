import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface BrandKit {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  visualNotes: string | null;
  toneNotes: string | null;
  constraints: string | null;
  brandColors: string[] | null;
  brandFonts: string[] | null;
  logoAssetKey: string | null;
  toneOfVoice: string | null;
  prohibitedElements: string | null;
  requiredElements: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandKitWithUrl extends BrandKit {
  logoUrl: string | null;
}

export interface ExtractedBrandKit {
  colors: string[];
  fonts: string[];
  logoDescription: string;
  toneOfVoice: string;
  prohibitedElements: string;
  requiredElements: string;
}

async function fetchBrandKit(): Promise<BrandKitWithUrl | null> {
  const res = await apiFetch("/api/workspace/brand-kit");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load brand kit");
  }
  const data = await res.json();
  if (!data.brandKit) return null;
  const bk = data.brandKit as BrandKit;
  return {
    ...bk,
    logoUrl: data.logoUrl ?? null,
    createdAt: new Date(bk.createdAt),
    updatedAt: new Date(bk.updatedAt),
  };
}

async function updateBrandKit(
  payload: Partial<
    Omit<BrandKit, "id" | "workspaceId" | "createdAt" | "updatedAt">
  >
): Promise<BrandKitWithUrl> {
  const res = await apiFetch("/api/workspace/brand-kit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save brand kit");
  }
  const data = await res.json();
  const bk = data.brandKit as BrandKit;
  return {
    ...bk,
    logoUrl: data.logoUrl ?? null,
    createdAt: new Date(bk.createdAt),
    updatedAt: new Date(bk.updatedAt),
  };
}

async function extractBrandKit(file: File): Promise<ExtractedBrandKit> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/api/workspace/brand-kit/extract", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to extract brand kit");
  }
  const data = await res.json();
  return data.extracted as ExtractedBrandKit;
}

async function uploadLogo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ reference: { id: string; assetKey: string; url: string }; logoAssetKey: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/workspace/brand-kit/logo");

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
            "content-type":
              xhr.getResponseHeader("content-type") ?? "application/json",
          }),
        })
      );
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upload logo");
  }
  const data = await res.json();
  return data;
}

async function clearBrandKit(): Promise<BrandKitWithUrl | null> {
  const res = await apiFetch("/api/workspace/brand-kit", {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to clear brand kit");
  }
  const data = await res.json();
  if (!data.brandKit) return null;
  const bk = data.brandKit as BrandKit;
  return {
    ...bk,
    logoUrl: data.logoUrl ?? null,
    createdAt: new Date(bk.createdAt),
    updatedAt: new Date(bk.updatedAt),
  };
}

export function useBrandKit() {
  return useQuery({
    queryKey: ["brand-kit"],
    queryFn: fetchBrandKit,
    staleTime: STALE_TIME.STATIC,
  });
}

function getBrandKitQueryKey() {
  return ["brand-kit"];
}

export function useUpdateBrandKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBrandKit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getBrandKitQueryKey() });
    },
  });
}

export function useExtractBrandKit() {
  return useMutation({
    mutationFn: extractBrandKit,
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (progress: number) => void;
    }) => uploadLogo(file, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getBrandKitQueryKey() });
    },
  });
}

export function useClearBrandKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearBrandKit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getBrandKitQueryKey() });
    },
  });
}
