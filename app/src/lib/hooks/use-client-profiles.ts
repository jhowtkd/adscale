import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ClientProfile {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  visualNotes: string | null;
  toneNotes: string | null;
  constraints: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientReference {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  assetKey: string;
  label: string;
  kind: string;
  notes: string | null;
  sourceDerivationId: string | null;
  createdAt: Date;
  url?: string;
}

async function fetchClientProfiles(): Promise<ClientProfile[]> {
  const res = await apiFetch("/api/client-profiles");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar perfis");
  }
  const data = await res.json();
  return (data.profiles as ClientProfile[]).map((p) => ({
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  }));
}

async function fetchClientReferences(clientProfileId: string): Promise<ClientReference[]> {
  const res = await apiFetch(`/api/client-profiles/${clientProfileId}/references`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar referências");
  }
  const data = await res.json();
  return (data.references as ClientReference[]).map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
  }));
}

async function createClientProfile(payload: {
  name: string;
  description?: string;
  visualNotes?: string;
  toneNotes?: string;
  constraints?: string;
}): Promise<ClientProfile> {
  const res = await apiFetch("/api/client-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar perfil");
  }
  const data = await res.json();
  const p = data.profile as ClientProfile;
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  };
}

async function createClientReference(
  clientProfileId: string,
  payload: {
    assetKey: string;
    label: string;
    kind: string;
    notes?: string;
  }
): Promise<ClientReference> {
  const res = await apiFetch(`/api/client-profiles/${clientProfileId}/references`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar referência");
  }
  const data = await res.json();
  const r = data.reference as ClientReference;
  return {
    ...r,
    createdAt: new Date(r.createdAt),
  };
}

async function saveDerivationAsReference(
  derivationId: string,
  payload: {
    clientProfileId: string;
    label: string;
    kind: string;
    notes?: string;
  }
): Promise<ClientReference> {
  const res = await apiFetch(`/api/derivations/${derivationId}/save-reference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao salvar referência");
  }
  const data = await res.json();
  const r = data.reference as ClientReference;
  return {
    ...r,
    createdAt: new Date(r.createdAt),
  };
}

export function useClientProfiles() {
  return useQuery({
    queryKey: ["client-profiles"],
    queryFn: fetchClientProfiles,
  });
}

export function useCreateClientProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createClientProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-profiles"] });
    },
  });
}

export function useClientReferences(clientProfileId?: string | null) {
  return useQuery({
    queryKey: ["client-references", clientProfileId],
    queryFn: () => fetchClientReferences(clientProfileId!),
    enabled: !!clientProfileId,
  });
}

export function useCreateClientReference(clientProfileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof createClientReference>[1]) =>
      createClientReference(clientProfileId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-references", clientProfileId] });
    },
  });
}

export function useSaveDerivationAsReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      derivationId,
      ...payload
    }: {
      derivationId: string;
      clientProfileId: string;
      label: string;
      kind: string;
      notes?: string;
    }) => saveDerivationAsReference(derivationId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["client-references", variables.clientProfileId],
      });
    },
  });
}
