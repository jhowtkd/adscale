"use client";

import { useCallback } from "react";
import { BETA_SESSION_STORAGE_KEY } from "@/lib/beta-analytics/constants";

type BetaEventProperties = Record<string, string | number | boolean>;

export function useRecordBetaEvent(campaignId: string) {
  const recordEvent = useCallback(
    (eventKey: string, properties?: BetaEventProperties) => {
      const sessionId =
        typeof window !== "undefined"
          ? sessionStorage.getItem(BETA_SESSION_STORAGE_KEY) ?? undefined
          : undefined;

      fetch("/api/analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventKey,
          campaignId,
          sessionId,
          properties,
        }),
      }).catch(() => {
        // Fire-and-forget — analytics must never block UI
      });
    },
    [campaignId]
  );

  return { recordEvent };
}
