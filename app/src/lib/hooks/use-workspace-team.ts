import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
}

async function fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const res = await apiFetch("/api/workspace/members");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar membros");
  }
  const data = await res.json();
  return (data.members ?? []) as WorkspaceMember[];
}

async function removeMember(userId: string): Promise<void> {
  const res = await apiFetch(`/api/workspace/members?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao remover membro");
  }
}

async function inviteMember(payload: { email: string; role: string }): Promise<void> {
  const res = await apiFetch("/api/workspace/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao enviar convite");
  }
}

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: ["workspace-members"],
    queryFn: fetchWorkspaceMembers,
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inviteMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
  });
}
