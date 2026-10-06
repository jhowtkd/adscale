"use client";

// React-query readers for the Equipe client screens. The accounts query is
// also the client-side pilot gate: a 404 means "not enabled", never an error.

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EquipeDisabledError,
  fetchAccountState,
  fetchEquipeAccounts,
  fetchGoals,
  fetchIdeas,
  fetchItemDetail,
  fetchPipeline,
  resolveEquipeItemAccount,
  type EquipeAccountJson,
} from "@/lib/equipe/api";
import { useBillingStatus } from "@/lib/hooks/use-billing";

export function equipeKeys(accountId: string | null) {
  return {
    accounts: ["equipe", "accounts"] as const,
    accountState: ["equipe", accountId, "account"] as const,
    pipeline: ["equipe", accountId, "pipeline"] as const,
    ideas: ["equipe", accountId, "ideas"] as const,
    goals: ["equipe", accountId, "goals"] as const,
    item: (itemId: string) => ["equipe", accountId, "item", itemId] as const,
  };
}

export function useEquipeAccounts() {
  return useQuery({
    queryKey: ["equipe", "accounts"],
    queryFn: fetchEquipeAccounts,
    retry: false,
    staleTime: 60_000,
  });
}

/** True when the workspace answers the Equipe API (pilot allowlist). */
export function useEquipeEnabled(): boolean | null {
  const { data, error, isLoading } = useEquipeAccounts();
  return useMemo(() => {
    if (isLoading) return null;
    if (error instanceof EquipeDisabledError) return false;
    if (error) return null;
    return Boolean(data);
  }, [data, error, isLoading]);
}

/**
 * The workspace's free plan as the server decides it (ticket 11, part 2), read from the billing status (one rule,
 * `findFreePlanAccount`). It FAILS CLOSED: `undefined` (unknown: no checkout, no classic panel) while loading, on any
 * error, or for a payload without the field; a free plan already known survives a failed refetch. `null` only when the
 * server said the workspace is not on it. `accountId` is null while the sign-up has no Equipe account yet.
 */
export function useFreePlanAccount(): { accountId: string | null; closedAccountId?: string } | null | undefined {
  const { data, isError, isLoading } = useBillingStatus();
  return useMemo(() => {
    const known = data?.freePlan;
    if (known) return known;
    if (isLoading || isError || known === undefined) return undefined;
    return null;
  }, [data, isError, isLoading]);
}

export function useEquipeAccountState(accountId: string | null) {
  return useQuery({
    refetchInterval: query => Object.values(query.state.data?.handoff?.reading ?? {}).some(g => g?.status === "pending" || g?.status === "running") ? 1500 : false,
    queryKey: equipeKeys(accountId).accountState,
    queryFn: () => fetchAccountState(accountId!),
    enabled: Boolean(accountId),
    retry: false,
  });
}

export function useEquipePipeline(accountId: string | null) {
  return useQuery({
    queryKey: equipeKeys(accountId).pipeline,
    queryFn: () => fetchPipeline(accountId!),
    enabled: Boolean(accountId),
    retry: false,
  });
}

export function useEquipeIdeas(accountId: string | null) {
  return useQuery({
    queryKey: equipeKeys(accountId).ideas,
    queryFn: () => fetchIdeas(accountId!),
    enabled: Boolean(accountId),
    retry: false,
  });
}

export function useEquipeGoals(accountId: string | null) {
  return useQuery({
    queryKey: equipeKeys(accountId).goals,
    queryFn: () => fetchGoals(accountId!),
    enabled: Boolean(accountId),
    retry: false,
  });
}

export function useEquipeItemDetail(accountId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: equipeKeys(accountId).item(itemId ?? ""),
    queryFn: () => fetchItemDetail(accountId!, itemId!),
    enabled: Boolean(accountId && itemId),
    retry: false,
  });
}

export function useInvalidateEquipe(accountId: string | null) {
  const client = useQueryClient();
  return () => {
    if (!accountId) return;
    void client.invalidateQueries({ queryKey: ["equipe", accountId] });
  };
}

/** Default account: the first with pending client decisions, else the first. */
export function defaultEquipeAccountId(accounts: EquipeAccountJson[]): string | null {
  return accounts.find((account) => account.pendingDecisions)?.id ?? accounts[0]?.id ?? null;
}

/**
 * The chosen account lives in `?account=`: read it, validate it against
 * the workspace's accounts, and stamp the default back into the URL so
 * the choice survives navigation between the screens. Switching accounts
 * rewrites the param, preserving the rest of the query.
 */
export function useEquipeAccountSelection(
  basePath: string,
  accounts: EquipeAccountJson[] | undefined,
): { selected: string | null; select: (accountId: string) => void } {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("account");
  const valid = param && accounts?.some((account) => account.id === param) ? param : null;
  const selected = valid ?? (accounts ? defaultEquipeAccountId(accounts) : null);

  useEffect(() => {
    if (!accounts || !selected || param === selected) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", selected);
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [accounts, selected, param, basePath, router, searchParams]);

  return {
    selected,
    select: (accountId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("account", accountId);
      router.replace(`${basePath}?${params.toString()}`, { scroll: false });
    },
  };
}

/** Resolve a bare `?item=` id to its account across the workspace's accounts. */
export function useEquipeItemAccount(
  accounts: EquipeAccountJson[] | undefined,
  itemId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["equipe", "item-account", itemId],
    queryFn: () => resolveEquipeItemAccount(accounts!, itemId!),
    enabled: enabled && Boolean(accounts && itemId),
    retry: false,
    staleTime: 60_000,
  });
}
