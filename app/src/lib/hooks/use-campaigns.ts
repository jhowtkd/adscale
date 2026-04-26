import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
  status: "draft" | "active" | "generating" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

export interface UiCampaign {
  id: string;
  name: string;
  client?: string;
  objective?: string;
  audience?: string;
  platforms: ("Meta" | "TikTok" | "Google")[];
  tone?: string;
  offer?: string;
  constraints?: string;
  notes?: string;
  status: Campaign["status"];
  variations: number;
  creditsUsed: number;
  lastModified: Date;
  createdAt: Date;
}

function toUiCampaign(c: Campaign): UiCampaign {
  return {
    id: c.id,
    name: c.name,
    client: c.client ?? undefined,
    objective: c.objective ?? undefined,
    audience: c.audience ?? undefined,
    platforms: (c.platforms ?? []) as ("Meta" | "TikTok" | "Google")[],
    tone: c.tone ?? undefined,
    offer: c.offer ?? undefined,
    constraints: c.constraints ?? undefined,
    notes: c.notes ?? undefined,
    status: c.status,
    variations: 0,
    creditsUsed: 0,
    lastModified: c.updatedAt,
    createdAt: c.createdAt,
  };
}

async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await apiFetch("/api/campaigns");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch campaigns");
  }
  const data = await res.json();
  return data.campaigns.map((c: Campaign) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  }));
}

async function fetchCampaign(id: string): Promise<Campaign> {
  const res = await apiFetch(`/api/campaigns/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch campaign");
  }
  const data = await res.json();
  const c = data.campaign as Campaign;
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  };
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
}): Promise<Campaign> {
  const res = await apiFetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create campaign");
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
    throw new Error(err.error || "Failed to update campaign");
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
    throw new Error(err.error || "Failed to delete campaign");
  }
}

export function useCampaigns() {
  const query = useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });

  return {
    ...query,
    campaigns: (query.data ?? []).map(toUiCampaign),
  };
}

export function useCampaign(id: string) {
  const query = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaign(id),
    enabled: !!id && id !== "new",
  });

  return {
    ...query,
    campaign: query.data ? toUiCampaign(query.data) : null,
  };
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateCampaign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Campaign>) => updateCampaign(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateCampaigns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Campaign> }) =>
      updateCampaign(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteCampaigns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      });
      return copy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
