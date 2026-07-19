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

export interface AvailableWorkspace {
  id: string;
  name: string;
}

/**
 * Thrown when the brand-kit endpoint returns a 409 because the workspace has
 * more than one client profile and no `clientProfileId` was supplied. Carries
 * the list of profiles so the UI can render a selector.
 */
export class BrandKitAmbiguousError extends Error {
  readonly availableWorkspaces: AvailableWorkspace[];
  constructor(message: string, availableWorkspaces: AvailableWorkspace[]) {
    super(message);
    this.name = "BrandKitAmbiguousError";
    this.availableWorkspaces = availableWorkspaces;
  }
}

/**
 * Thrown when the brand-kit endpoint returns a 404 because the supplied
 * `clientProfileId` does not resolve to a real client profile.
 */
export class BrandKitProfileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandKitProfileNotFoundError";
  }
}

async function readBrandKitError(res: Response): Promise<{ message: string; body: Record<string, unknown> }> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message =
    (typeof body.error === "string" && body.error) ||
    (typeof body.message === "string" && body.message) ||
    "Failed to load brand kit";
  return { message, body };
}

function extractAvailableWorkspaces(body: Record<string, unknown>): AvailableWorkspace[] {
  const details = body.details as { availableWorkspaces?: unknown } | undefined;
  const raw = details?.availableWorkspaces;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is AvailableWorkspace =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as AvailableWorkspace).id === "string" &&
        typeof (entry as AvailableWorkspace).name === "string"
    )
    .map((entry) => ({ id: entry.id, name: entry.name }));
}

async function fetchBrandKit(clientProfileId?: string): Promise<BrandKitWithUrl | null> {
  const url = clientProfileId
    ? `/api/workspace/brand-kit?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "/api/workspace/brand-kit";
  const res = await apiFetch(url);
  if (!res.ok) {
    const { message, body } = await readBrandKitError(res);
    const code = typeof body.code === "string" ? body.code : "";
    if (res.status === 409 || code === "workspace_ambiguous") {
      throw new BrandKitAmbiguousError(message, extractAvailableWorkspaces(body));
    }
    if (res.status === 404 || code === "client_profile_not_found") {
      throw new BrandKitProfileNotFoundError(message);
    }
    throw new Error(message);
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
  >,
  clientProfileId?: string
): Promise<BrandKitWithUrl> {
  const res = await apiFetch("/api/workspace/brand-kit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, clientProfileId }),
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
    timeoutMs: 120_000,
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
  clientProfileId?: string,
  onProgress?: (progress: number) => void
): Promise<{ reference: { id: string; assetKey: string; url: string }; logoAssetKey: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const logoUrl = clientProfileId
    ? `/api/workspace/brand-kit/logo?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "/api/workspace/brand-kit/logo";

  const res = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", logoUrl);

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

async function clearBrandKit(clientProfileId?: string): Promise<BrandKitWithUrl | null> {
  const url = clientProfileId
    ? `/api/workspace/brand-kit?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "/api/workspace/brand-kit";
  const res = await apiFetch(url, {
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

export function resolveBrandKitClientProfileId(options: {
  clientProfileId?: string | null;
  clientProfiles?: { id: string }[] | null;
}): string | undefined {
  if (options.clientProfileId) return options.clientProfileId;
  if (options.clientProfiles?.length === 1) return options.clientProfiles[0].id;
  return undefined;
}

export function shouldFetchBrandKit(options: {
  clientProfileId?: string | null;
  clientProfiles?: { id: string }[] | null;
  profilesLoaded: boolean;
}): boolean {
  if (options.clientProfileId) return true;
  if (!options.profilesLoaded) return false;
  return (options.clientProfiles?.length ?? 0) <= 1;
}

function shouldRetryBrandKitQuery(error: unknown): boolean {
  return !(
    error instanceof BrandKitAmbiguousError ||
    error instanceof BrandKitProfileNotFoundError
  );
}

export function useBrandKit(
  clientProfileId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["brand-kit", clientProfileId ?? null],
    queryFn: () => fetchBrandKit(clientProfileId),
    staleTime: STALE_TIME.STATIC,
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) =>
      shouldRetryBrandKitQuery(error) && failureCount < 3,
  });
}

export function useUpdateBrandKit(clientProfileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof updateBrandKit>[0]) =>
      updateBrandKit(payload, clientProfileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-kit"] });
      queryClient.invalidateQueries({
        queryKey: ["brand-training-status", clientProfileId ?? null],
      });
    },
  });
}

export function useExtractBrandKit(clientProfileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: extractBrandKit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-kit", clientProfileId ?? null] });
    },
  });
}

export function useUploadLogo(clientProfileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (progress: number) => void;
    }) => uploadLogo(file, clientProfileId, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-kit"] });
      queryClient.invalidateQueries({
        queryKey: ["brand-training-status", clientProfileId ?? null],
      });
    },
  });
}

export function useClearBrandKit(clientProfileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearBrandKit(clientProfileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-kit"] });
      queryClient.invalidateQueries({
        queryKey: ["brand-training-status", clientProfileId ?? null],
      });
    },
  });
}
