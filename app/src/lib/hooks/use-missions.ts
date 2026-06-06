"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import type { WorkspaceMissionsResponse } from "@/lib/progression/missions/types";

async function fetchWorkspaceMissions(): Promise<WorkspaceMissionsResponse> {
  const res = await apiFetch("/api/workspace/missions", {
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error("Failed to fetch workspace missions");
  return (await res.json()) as WorkspaceMissionsResponse;
}

export function useMissions() {
  return useQuery({
    queryKey: ["workspace", "missions"],
    queryFn: fetchWorkspaceMissions,
    staleTime: STALE_TIME.DYNAMIC,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}
