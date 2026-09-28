"use client";

// React-query readers for the Equipe client screens. The accounts query is
// also the client-side pilot gate: a 404 means "not enabled", never an error.

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EquipeDisabledError,
  fetchAccountState,
  fetchEquipeAccounts,
  fetchGoals,
  fetchIdeas,
  fetchItemDetail,
  fetchPipeline,
} from "@/lib/equipe/api";

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

export function useEquipeAccountState(accountId: string | null) {
  return useQuery({
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
