"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import type { WorkspaceProgressionResponse } from "@/lib/progression/types";

async function fetchWorkspaceProgression(): Promise<WorkspaceProgressionResponse> {
  const res = await apiFetch("/api/workspace/progression", {
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error("Failed to fetch workspace progression");
  return (await res.json()) as WorkspaceProgressionResponse;
}

export function useProgression() {
  return useQuery({
    queryKey: ["workspace", "progression"],
    queryFn: fetchWorkspaceProgression,
    staleTime: STALE_TIME.DYNAMIC,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}
