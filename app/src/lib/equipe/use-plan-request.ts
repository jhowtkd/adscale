"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requestEquipeSupport } from "@/lib/equipe/commands";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";

/**
 * One plan request is enough for every card of the conversation: when one of them asked, the others show it too instead of offering the same button again.
 * The server is idempotent (a second request joins the open one), so a reload that forgets it is harmless.
 */
const requestedKey = (accountId: string) => ["equipe-plan-requested", accountId] as const;

/** The plan request of a free account. The plan card and the diagnosis card that failed for lack of credit (ticket 13, D-12) ask the same thing the same way. */
export function usePlanRequest(accountId: string, threadId?: string | null) {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  /** This card sent the request (the shared flag says some card did): only that one takes the focus to its confirmation. */
  const [requestedHere, setRequestedHere] = useState(false);
  const requested = useQuery({ queryKey: requestedKey(accountId), queryFn: () => false, enabled: false, initialData: false, staleTime: Infinity }).data === true;

  const request = async () => {
    if (busy.current || requested) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      await requestEquipeSupport(accountId, { purpose: "plan" });
      queryClient.setQueryData(requestedKey(accountId), true);
      setRequestedHere(true);
      if (threadId) await queryClient.invalidateQueries({ queryKey: assistantThreadQueryKey(threadId) });
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return { pending, requested, requestedHere, error, request };
}
