import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface WorkspaceAsset {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  tags: string[] | null;
  aiDescription: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  url: string;
  createdAt: string;
}

export function useWorkspaceAssets(options: {
  q?: string;
  tags?: string[];
  type?: string;
  source?: string;
  page?: number;
  limit?: number;
} = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.tags?.length) params.set("tags", options.tags.join(","));
  if (options.type) params.set("type", options.type);
  if (options.source) params.set("source", options.source);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));

  const queryString = params.toString();
  const url = `/api/workspace/assets${queryString ? `?${queryString}` : ""}`;

  return useQuery<{ assets: WorkspaceAsset[] }>({
    queryKey: ["workspace-assets", options],
    queryFn: async () => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Failed to load assets");
      return res.json();
    },
  });
}

export function useDeleteWorkspaceAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/workspace/assets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete asset");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-assets"] });
    },
  });
}
