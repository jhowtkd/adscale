import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CampaignTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
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
  creativeLevel: string | null;
  styleIntensity: string | null;
  ctaVariants: string[] | null;
  targetFormats: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

async function fetchTemplates(): Promise<CampaignTemplate[]> {
  const res = await apiFetch("/api/templates");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar templates");
  }
  const data = await res.json();
  return data.templates.map((t: CampaignTemplate) => ({
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  }));
}

async function fetchTemplate(id: string): Promise<CampaignTemplate> {
  const res = await apiFetch(`/api/templates/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar template");
  }
  const data = await res.json();
  const t = data.template as CampaignTemplate;
  return {
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

async function createTemplate(payload: {
  campaignId: string;
  name: string;
  description?: string;
}): Promise<CampaignTemplate> {
  const res = await apiFetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar template");
  }
  const data = await res.json();
  const t = data.template as CampaignTemplate;
  return {
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

async function deleteTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/templates/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir template");
  }
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => fetchTemplate(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}
