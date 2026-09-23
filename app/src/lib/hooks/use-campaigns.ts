import { apiFetch } from "@/lib/api-client";
import {
  CampaignLoadError,
  parseCampaignLoadError,
  parseFetchFailure,
} from "@/lib/campaign-load-error";
import { STALE_TIME } from "@/lib/query-config";
import { invalidateWorkListProjections } from "@/lib/hooks/use-canonical-works";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  client: string | null;
  product: string | null;
  objective: string | null;
  audience: string | null;
  platforms: string[] | null;
  tone: string | null;
  offer: string | null;
  constraints: string | null;
  notes: string | null;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme" | null;
  styleIntensity: "soft" | "medium" | "strong" | null;
  ctaVariants: string[] | null;
  targetFormats: string[] | null;
  creativeDiagnosisStatus: "pending" | "analyzing" | "ready" | "failed";
  creativeDiagnosis: {
    detectedConcept: string;
    elementsToPreserve: string[];
    variationOpportunities: string[];
  } | null;
  creativeDiagnosisSource: "ai" | "edited" | "regenerated" | null;
  clientProfileId?: string | null;
  selectedReferenceIds?: string[] | null;
  status: "draft" | "active" | "generating" | "completed" | "failed";
  variations?: number;
  creditsUsed?: number;
  totalDerivations?: number;
  activeDerivations?: number;
  failedDerivations?: number;
  completedDerivations?: number;
  previewPendingBatch?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignListSortOption =
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc"
  | "variations";

export interface CampaignListQuery {
  searchQuery?: string;
  statusFilter?: "all" | "draft" | "active" | "generating" | "completed" | "failed";
  platformFilter?: "all" | "Meta" | "TikTok" | "Google";
  sortOption?: CampaignListSortOption;
  page?: number;
  limit?: number;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
  totalCount: number;
}

export interface UiCampaign {
  id: string;
  workspaceId: string;
  name: string;
  client?: string;
  product?: string;
  objective?: string;
  audience?: string;
  platforms: ("Meta" | "TikTok" | "Google")[];
  tone?: string;
  offer?: string;
  constraints?: string;
  notes?: string;
  generationMode: Campaign["generationMode"];
  creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
  styleIntensity?: "soft" | "medium" | "strong";
  ctaVariants?: string[];
  targetFormats?: string[];
  creativeDiagnosisStatus?: "pending" | "analyzing" | "ready" | "failed";
  creativeDiagnosis?: {
    detectedConcept: string;
    elementsToPreserve: string[];
    variationOpportunities: string[];
  };
  creativeDiagnosisSource?: "ai" | "edited" | "regenerated";
  clientProfileId?: string;
  selectedReferenceIds?: string[];
  status: Campaign["status"];
  variations: number;
  creditsUsed: number;
  totalDerivations: number;
  activeDerivations: number;
  failedDerivations: number;
  completedDerivations: number;
  previewPendingBatch?: boolean;
  lastModified: Date;
  createdAt: Date;
}

function toUiCampaign(c: Campaign): UiCampaign {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    name: c.name,
    client: c.client ?? undefined,
    product: c.product ?? undefined,
    objective: c.objective ?? undefined,
    audience: c.audience ?? undefined,
    platforms: (c.platforms ?? []) as ("Meta" | "TikTok" | "Google")[],
    tone: c.tone ?? undefined,
    offer: c.offer ?? undefined,
    constraints: c.constraints ?? undefined,
    notes: c.notes ?? undefined,
    generationMode: c.generationMode,
    creativeLevel: c.creativeLevel ?? undefined,
    styleIntensity: c.styleIntensity ?? undefined,
    ctaVariants: c.ctaVariants ?? undefined,
    targetFormats: c.targetFormats ?? undefined,
    clientProfileId: c.clientProfileId ?? undefined,
    selectedReferenceIds: c.selectedReferenceIds ?? undefined,
    creativeDiagnosisStatus: c.creativeDiagnosisStatus ?? undefined,
    creativeDiagnosis: c.creativeDiagnosis ?? undefined,
    creativeDiagnosisSource: c.creativeDiagnosisSource ?? undefined,
    status: c.status,
    variations: c.variations ?? 0,
    creditsUsed: c.creditsUsed ?? 0,
    totalDerivations: c.totalDerivations ?? 0,
    activeDerivations: c.activeDerivations ?? 0,
    failedDerivations: c.failedDerivations ?? 0,
    completedDerivations: c.completedDerivations ?? 0,
    previewPendingBatch: c.previewPendingBatch ?? false,
    lastModified: c.updatedAt,
    createdAt: c.createdAt,
  };
}

async function fetchCampaigns(query?: CampaignListQuery): Promise<CampaignListResponse> {
  const params = new URLSearchParams();
  if (query?.searchQuery) params.set("q", query.searchQuery);
  if (query?.statusFilter && query.statusFilter !== "all") params.set("status", query.statusFilter);
  if (query?.platformFilter && query.platformFilter !== "all") params.set("platform", query.platformFilter);
  if (query?.sortOption && query.sortOption !== "newest") params.set("sort", query.sortOption);
  if (query?.page && query.page > 1) params.set("page", String(query.page));
  if (query?.limit) params.set("limit", String(query.limit));

  const res = await apiFetch(`/api/campaigns${params.toString() ? `?${params.toString()}` : ""}`, {
    timeoutMs: 60_000,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar campanhas");
  }
  const data = await res.json();
  const rawCampaigns = (data.campaigns ?? data ?? []) as Campaign[];
  return {
    campaigns: rawCampaigns.map((c: Campaign) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    })),
    totalCount: typeof data.totalCount === "number" ? data.totalCount : rawCampaigns.length,
  };
}

async function fetchCampaign(id: string): Promise<Campaign> {
  try {
    const res = await apiFetch(`/api/campaigns/${id}`);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw parseCampaignLoadError(res, err);
    }
    const data = await res.json();
    const c = data.campaign as Campaign;
    return {
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    };
  } catch (error) {
    throw parseFetchFailure(error);
  }
}

async function createCampaign(payload: {
  name: string;
  client?: string;
  product?: string;
  objective?: string;
  audience?: string;
  platforms?: string[];
  tone?: string;
  offer?: string;
  constraints?: string;
  notes?: string;
  generationMode?: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
  styleIntensity?: "soft" | "medium" | "strong";
  ctaVariants?: string[];
  targetFormats?: string[];
  clientProfileId?: string | null;
  selectedReferenceIds?: string[];
}): Promise<Campaign> {
  const res = await apiFetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 60_000,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar campanha");
  }
  const data = await res.json();
  const c = data.campaign as Campaign;
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  };
}

async function updateCampaign(
  id: string,
  payload: Partial<Campaign>
): Promise<Campaign> {
  const res = await apiFetch(`/api/campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao atualizar campanha");
  }
  const data = await res.json();
  const c = data.campaign as Campaign;
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  };
}

async function deleteCampaign(id: string): Promise<void> {
  const res = await apiFetch(`/api/campaigns/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir campanha");
  }
}

export function useCampaigns(filters?: CampaignListQuery) {
  const query = useQuery({
    queryKey: ["campaigns", filters ?? {}],
    queryFn: () => fetchCampaigns(filters),
    staleTime: STALE_TIME.SEMI_STATIC,
    refetchOnWindowFocus: true,
  });
  const campaigns = useMemo(
    () => (query.data?.campaigns ?? []).map(toUiCampaign),
    [query.data?.campaigns],
  );

  return {
    ...query,
    campaigns,
    totalCount: query.data?.totalCount ?? 0,
  };
}

export function useCampaign(id: string) {
  const query = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaign(id),
    enabled: !!id && id !== "new",
    staleTime: STALE_TIME.SEMI_STATIC,
    refetchInterval: (query) => {
      return query.state.data?.status === "generating" ? 2000 : false;
    },
  });
  const campaign = useMemo(() => query.data ? toUiCampaign(query.data) : null, [query.data]);

  const loadError = query.error instanceof CampaignLoadError ? query.error : null;

  return {
    ...query,
    campaign,
    loadError,
    loadErrorKind: loadError?.kind ?? null,
  };
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCampaign,
    onSuccess: async () => {
      await Promise.all([
        invalidateWorkListProjections(queryClient),
        queryClient.invalidateQueries({ queryKey: ["creative-work", "campaign-options"] }),
      ]);
    },
  });
}

export function useUpdateCampaign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Campaign>) => updateCampaign(id, payload),
    onSuccess: async () => {
      await Promise.all([
        invalidateWorkListProjections(queryClient),
        queryClient.invalidateQueries({ queryKey: ["campaigns", id] }),
      ]);
    },
  });
}

export function useUpdateCampaigns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Campaign> }) =>
      updateCampaign(id, payload),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateWorkListProjections(queryClient),
        queryClient.invalidateQueries({ queryKey: ["campaigns", variables.id] }),
      ]);
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: async () => {
      await invalidateWorkListProjections(queryClient);
    },
  });
}

export function useDeleteCampaigns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: async () => {
      await invalidateWorkListProjections(queryClient);
    },
  });
}

async function runCampaignBatch(ids: string[], action: (id: string) => Promise<unknown>) {
  const failedIds: string[] = [];
  for (let i = 0; i < ids.length; i += 4) {
    const chunk = ids.slice(i, i + 4);
    const results = await Promise.allSettled(chunk.map(action));
    results.forEach((result, index) => {
      if (result.status === "rejected") failedIds.push(chunk[index]);
    });
  }
  return failedIds;
}

export function useBulkCampaignActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "archive" | "delete" }) =>
      runCampaignBatch(ids, action === "archive"
        ? (id) => updateCampaign(id, { status: "draft" })
        : deleteCampaign),
    onSuccess: async () => {
      await invalidateWorkListProjections(queryClient);
    },
  });
}

export function useDuplicateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const original = await fetchCampaign(id);
      const copy = await createCampaign({
        name: `${original.name} (Copy)`,
        client: original.client ?? undefined,
        product: original.product ?? undefined,
        objective: original.objective ?? undefined,
        audience: original.audience ?? undefined,
        platforms: original.platforms ?? undefined,
        tone: original.tone ?? undefined,
        offer: original.offer ?? undefined,
        constraints: original.constraints ?? undefined,
        notes: original.notes ?? undefined,
        generationMode: original.generationMode ?? undefined,
        creativeLevel: original.creativeLevel ?? undefined,
        styleIntensity: original.styleIntensity ?? undefined,
        ctaVariants: original.ctaVariants ?? undefined,
        targetFormats: original.targetFormats ?? undefined,
      });
      return copy;
    },
    onSuccess: async () => {
      await invalidateWorkListProjections(queryClient);
    },
  });
}
