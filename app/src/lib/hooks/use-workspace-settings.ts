import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface WorkspaceSettingsResponse {
  name: string;
  slug: string;
  description: string;
  industry: string;
  website: string;
  timezone: string;
  canEdit?: boolean;
}

export type UpdateWorkspaceSettingsInput = Partial<
  Omit<WorkspaceSettingsResponse, "canEdit">
>;

function normalizeWorkspaceSettings(
  data: Record<string, unknown>
): WorkspaceSettingsResponse {
  return {
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    description: data.description == null ? "" : String(data.description),
    industry: data.industry == null ? "" : String(data.industry),
    website: data.website == null ? "" : String(data.website),
    timezone: data.timezone == null ? "" : String(data.timezone),
    ...(typeof data.canEdit === "boolean" ? { canEdit: data.canEdit } : {}),
  };
}

async function fetchWorkspaceSettings(): Promise<WorkspaceSettingsResponse> {
  const res = await apiFetch("/api/workspace/settings");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load workspace settings");
  }
  const data = await res.json();
  return normalizeWorkspaceSettings(data);
}

async function updateWorkspaceSettings(
  payload: UpdateWorkspaceSettingsInput
): Promise<WorkspaceSettingsResponse> {
  const res = await apiFetch("/api/workspace/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save workspace settings");
  }
  const data = await res.json();
  return normalizeWorkspaceSettings(data);
}

function getWorkspaceSettingsQueryKey() {
  return ["workspace-settings"];
}

export function useWorkspaceSettings() {
  return useQuery({
    queryKey: getWorkspaceSettingsQueryKey(),
    queryFn: fetchWorkspaceSettings,
    staleTime: STALE_TIME.STATIC,
  });
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateWorkspaceSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getWorkspaceSettingsQueryKey() });
    },
  });
}
