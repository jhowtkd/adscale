"use client";

// Who a conversation belongs to: the Equipe account of its brand, whether it is the main conversation or a parallel
// one (and its topic), and the account's status. Read from the account list and the account state, both already cached.

import { useActiveBrand } from "@/lib/brands/active-brand-context";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";
import { defaultEquipeAccountId, useEquipeAccountState, useEquipeAccounts } from "@/lib/equipe/use-equipe";
import type { EquipeThreadJson } from "@/lib/equipe/api";

export type ConversationContext = {
  /** The account of the thread's brand; null while loading or when the thread is not an account's. */
  accountId: string | null;
  clientProfileId: string | null;
  accountStatus: string | null;
  /** Null while the account state is loading. */
  isPrimary: boolean | null;
  /** The topic of a parallel conversation. */
  topic: string | null;
  parallel: EquipeThreadJson[];
};

export function useConversationContext(threadId: string | null): ConversationContext {
  const accounts = useEquipeAccounts().data?.accounts;
  const thread = useAssistantThread(threadId).data?.thread;
  const brand = useActiveBrand();
  // Before the thread loads, the default account stands in (the active brand's, in the rail): the rail and the panel need an account for the first paint.
  const account =
    accounts?.find((entry) => entry.clientProfileId === thread?.clientProfileId) ??
    (thread || !accounts ? null : accounts.find((entry) => entry.id === defaultEquipeAccountId(accounts, brand)) ?? null);
  const state = useEquipeAccountState(account?.id ?? null).data;
  const parallel = state?.threads?.parallel ?? [];
  const primaryThreadId = state?.threads?.primary?.assistantThreadId ?? null;
  return {
    accountId: account?.id ?? null,
    clientProfileId: account?.clientProfileId ?? thread?.clientProfileId ?? null,
    accountStatus: state?.status ?? account?.status ?? null,
    isPrimary: !state?.threads || !threadId ? null : primaryThreadId === threadId,
    topic: parallel.find((entry) => entry.assistantThreadId === threadId)?.topic ?? null,
    parallel,
  };
}
