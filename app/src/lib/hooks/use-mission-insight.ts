"use client";

import { useMutation } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import type { MissionInsightPayload } from "@/lib/mission-insights/types";

export function useSubmitMissionInsight() {
  const pathname = usePathname();

  return useMutation({
    mutationFn: async (input: MissionInsightPayload) => {
      const res = await apiFetch("/api/workspace/mission-insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          route: input.route ?? pathname,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit mission insight");
      }

      return res.json();
    },
  });
}
