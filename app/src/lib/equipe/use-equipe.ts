"use client";

// React-query readers for the Equipe client screens.

import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAccountState,
  fetchEquipeAccounts,
  fetchGoals,
  fetchIdeas,
  fetchItemDetail,
  fetchPipeline,
  resolveEquipeItemAccount,
  type EquipeAccountJson,
} from "@/lib/equipe/api";
import { useActiveBrand, useSwitchActiveBrand } from "@/lib/brands/active-brand-context";
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
  const brand = useActiveBrand();
  return useQuery({
    queryKey: ["equipe", "accounts"],
    queryFn: fetchEquipeAccounts,
    retry: false,
    // In the rail, a list without the active brand's account is read again by the next screen: `/` opens that account on
    // the brand's first visit, so the screen that sent the person there finds it on the way back.
    staleTime: (query) =>
      brand && !query.state.data?.accounts.some((account) => account.clientProfileId === brand.id) ? 0 : 60_000,
  });
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

/**
 * Default account. In the rail (spec 2026-10-07 §3) it is the active brand's own account, null while that brand has none;
 * outside it, the first with pending client decisions, else the first.
 */
export function defaultEquipeAccountId(accounts: EquipeAccountJson[], activeBrand?: { id: string } | null): string | null {
  if (activeBrand !== undefined) {
    return activeBrand ? accounts.find((account) => account.clientProfileId === activeBrand.id)?.id ?? null : null;
  }
  return accounts.find((account) => account.pendingDecisions)?.id ?? accounts[0]?.id ?? null;
}

/**
 * The chosen account lives in `?account=`: read it, validate it against
 * the workspace's accounts, and stamp the default back into the URL so
 * the choice survives navigation between the screens.
 */
export function useEquipeAccountSelection(
  basePath: string,
  accounts: EquipeAccountJson[] | undefined,
): { selected: string | null } {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("account");
  const valid = param && accounts?.some((account) => account.id === param) ? param : null;
  const brand = useActiveBrand();
  const switchBrand = useSwitchActiveBrand();
  const freePlan = useFreePlanAccount();
  // A link to another brand's account (a notice, a shared URL) makes that brand the active one, on the same screen: the
  // rail and the screen always show the same brand (spec 2026-10-07 §3).
  const linkedBrand = valid && brand ? accounts?.find((account) => account.id === valid)?.clientProfileId : undefined;
  // The free plan pins the rail to its account's brand (`pickActiveBrand` on the server), so no link can switch it: the
  // screen shows the rail brand's account instead, and the URL is stamped with it below.
  const pinned = Boolean(freePlan && (freePlan.accountId ?? freePlan.closedAccountId));
  const refused = pinned && linkedBrand !== undefined && linkedBrand !== brand?.id;
  const selected = (refused ? null : valid) ?? (accounts ? defaultEquipeAccountId(accounts, brand) : null);
  // The brand is a new object after every router.refresh(). When the server refuses the linked brand the rail keeps the
  // old one, so remember the brand already asked for and ask once, instead of again after each refresh.
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (refused || !linkedBrand || !brand || linkedBrand === brand.id || askedFor.current === linkedBrand) return;
    askedFor.current = linkedBrand;
    switchBrand(linkedBrand, { stay: true });
  }, [refused, linkedBrand, brand, switchBrand]);

  useEffect(() => {
    if (!accounts || !selected || param === selected) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", selected);
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [accounts, selected, param, basePath, router, searchParams]);

  return { selected };
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
