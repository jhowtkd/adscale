import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
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

export class TemplateLoadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TemplateLoadError";
    this.status = status;
  }
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

export async function fetchTemplate(id: string): Promise<CampaignTemplate> {
  const res = await apiFetch(`/api/templates/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new TemplateLoadError(
      res.status,
      err.error || "Erro ao carregar template"
    );
  }
  const data = await res.json();
  const t = data.template as CampaignTemplate;
  return {
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

/** Phase 5 / item 39: server-side materialize (not client field merge). */
export async function materializeTemplate(
  templateId: string,
  payload: { name: string; client: string }
): Promise<{ campaign: { id: string; name: string }; canonical?: unknown }> {
  const res = await apiFetch(`/api/templates/${templateId}/materialize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao materializar template");
  }
  return res.json();
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
    staleTime: STALE_TIME.STATIC,
  });
}

function useTemplate(id: string) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => fetchTemplate(id),
    enabled: !!id,
    staleTime: STALE_TIME.STATIC,
  });
}

export { useTemplate };

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

async function updateTemplateRequest(
  id: string,
  data: { name?: string; description?: string }
): Promise<CampaignTemplate> {
  const res = await apiFetch(`/api/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao atualizar template");
  }
  const result = await res.json();
  return result.template as CampaignTemplate;
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string } }) =>
      updateTemplateRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.removeQueries({ queryKey: ["templates", id] });
    },
  });
}
