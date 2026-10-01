"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requestEquipeSupport } from "@/lib/equipe/commands";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";

/** The plan request of a free account. The plan card and the diagnosis card that failed for lack of credit (ticket 13, D-12) ask the same thing the same way. */
export function usePlanRequest(accountId: string, threadId?: string | null) {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);

  const request = async () => {
    if (busy.current || requested) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      await requestEquipeSupport(accountId, { purpose: "plan" });
      setRequested(true);
      if (threadId) await queryClient.invalidateQueries({ queryKey: assistantThreadQueryKey(threadId) });
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return { pending, requested, error, request };
}
