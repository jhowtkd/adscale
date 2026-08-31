"use client";

import { useCallback, useRef } from "react";
import { BETA_SESSION_STORAGE_KEY } from "@/lib/beta-analytics/constants";

type BetaEventProperties = Record<string, string | number | boolean>;

const DEDUPE_WINDOW_MS = 5_000;

export function useRecordBetaEvent(
  campaignId?: string | null,
  options: { includeBetaSession?: boolean } = {},
) {
  const recentEventsRef = useRef(new Map<string, number>());

  const recordEvent = useCallback(
    (eventKey: string, properties?: BetaEventProperties) => {
      const sessionId =
        options.includeBetaSession !== false && typeof window !== "undefined"
          ? sessionStorage.getItem(BETA_SESSION_STORAGE_KEY) ?? undefined
          : undefined;

      const dedupeKey = `${eventKey}:${campaignId ?? "none"}:${sessionId ?? "anon"}:${JSON.stringify(properties ?? {})}`;
      const now = Date.now();
      const lastSent = recentEventsRef.current.get(dedupeKey);
      if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
        return;
      }
      recentEventsRef.current.set(dedupeKey, now);

      fetch("/api/analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventKey,
          ...(campaignId ? { campaignId } : {}),
          ...(sessionId ? { sessionId } : {}),
          properties,
        }),
      })
        .then((response) => {
          if (response.status === 429) {
            return;
          }
        })
        .catch(() => {
          // Fire-and-forget — analytics must never block UI
        });
    },
    [campaignId, options.includeBetaSession]
  );

  return { recordEvent };
}
