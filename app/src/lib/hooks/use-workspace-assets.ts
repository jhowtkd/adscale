import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";

export interface WorkspaceAsset {
  id: string;
  workspaceId: string;
  clientProfileId?: string | null;
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
  clientProfileId?: string;
  enabled?: boolean;
  kind?: "identity" | "images" | "post" | "page";
  q?: string;
  tags?: string[];
  type?: string;
  source?: string;
  excludeSources?: string[];
  page?: number;
  limit?: number;
} = {}) {
  const params = new URLSearchParams();
  if (options.clientProfileId) params.set("clientProfileId", options.clientProfileId);
  if (options.kind) params.set("kind", options.kind);
  if (options.q) params.set("q", options.q);
  if (options.tags?.length) params.set("tags", options.tags.join(","));
  if (options.type) params.set("type", options.type);
  if (options.source) params.set("source", options.source);
  if (options.excludeSources?.length) params.set("excludeSources", options.excludeSources.join(","));
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));

  return useInfiniteQuery({
    queryKey: ["workspace-assets", options],
    enabled: options.enabled,
    initialPageParam: options.page ?? 1,
    queryFn: async ({ pageParam }): Promise<{ assets: WorkspaceAsset[]; total: number }> => {
      const pageParams = new URLSearchParams(params);
      pageParams.set("page", String(pageParam));
      const res = await apiFetch(`/api/workspace/assets?${pageParams}`);
      if (!res.ok) throw new Error("Failed to load assets");
      return res.json();
    },
    getNextPageParam: (lastPage, pages, lastPageParam) => pages.reduce((count, page) => count + page.assets.length, 0) < lastPage.total && lastPage.assets.length > 0 ? lastPageParam + 1 : undefined,
    select: result => ({ assets: result.pages.flatMap(page => page.assets), total: result.pages[0]?.total ?? 0 }),
    staleTime: STALE_TIME.STATIC,
  });
}

export function useDeleteWorkspaceAsset() {
  const queryClient = useQueryClient();
  const t = useTranslations("common");

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
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("error"));
    },
  });
}
