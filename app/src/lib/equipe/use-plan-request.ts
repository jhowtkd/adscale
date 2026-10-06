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
/** The free plan's CTA before the plan can be asked (ticket 11, part 2): a person is asked instead, about the plan. */
const personRequestedKey = (accountId: string) => ["equipe-plan-person-requested", accountId] as const;
export const PLAN_PERSON_NOTE = "Quero falar com vocês sobre o plano.";

/** The plan request of a free account. The plan card and the diagnosis card that failed for lack of credit (ticket 13, D-12) ask the same thing the same way. */
export function usePlanRequest(accountId: string, threadId?: string | null, options: { asPerson?: boolean } = {}) {
  // `asPerson`: the plan request is only accepted once there is a diagnosis (or the free credit ran out before one); before
  // that, the same button asks for a person with the plan note, which the server accepts in any state. That request is
  // tracked apart, so the plan cards of the conversation still offer the real plan request later.
  const key = options.asPerson ? personRequestedKey(accountId) : requestedKey(accountId);
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  /** This card sent the request (the shared flag says some card did): only that one takes the focus to its confirmation. */
  const [requestedHere, setRequestedHere] = useState(false);
  const requested = useQuery({ queryKey: key, queryFn: () => false, enabled: false, initialData: false, staleTime: Infinity }).data === true;

  const request = async () => {
    if (busy.current || requested) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      await requestEquipeSupport(accountId, options.asPerson ? { note: PLAN_PERSON_NOTE } : { purpose: "plan" });
      queryClient.setQueryData(key, true);
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
