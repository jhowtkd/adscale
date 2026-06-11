import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type BillingAccessKind = "paid" | "beta" | "none";

export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "none";

export type PastDueRecoveryAction = "portal";
export type PastDueSpendPolicy = "existing_credits_spendable";

export interface BillingStatus {
  hasCustomer: boolean;
  subscriptionStatus: BillingSubscriptionStatus;
  access: {
    kind: BillingAccessKind;
    label: string;
    remainingAds: number | null;
    hasSpendAccess: boolean;
    beta: {
      totalAds: number;
      remainingAds: number;
      exhausted: boolean;
    } | null;
  };
  pastDue: {
    recoveryAction: PastDueRecoveryAction;
    spendPolicy: PastDueSpendPolicy;
  } | null;
  subscription: {
    status: BillingSubscriptionStatus;
    rawStatus: string;
    planKey: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  creditBalance: number;
}

async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await apiFetch("/api/billing/status");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar cobrança");
  }
  const data = await res.json();
  return data.billing;
}

export interface StartCheckoutInput {
  planKey: "starter" | "growth" | "scale";
  returnPath?: string;
}

async function startCheckout(input: StartCheckoutInput) {
  const res = await apiFetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || data.code || "Erro ao abrir checkout");
  }
  window.location.href = data.url;
  return data.url as string;
}

async function openBillingPortal() {
  const res = await apiFetch("/api/billing/portal", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || data.code || "Erro ao abrir portal");
  }
  window.location.href = data.url;
  return data.url as string;
}

export function useBillingStatus() {
  return useQuery({
    queryKey: ["billing", "status"],
    queryFn: fetchBillingStatus,
    staleTime: STALE_TIME.SEMI_STATIC,
  });
}

export function useStartCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startCheckout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "status"] });
    },
  });
}

export function useBillingPortal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: openBillingPortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "status"] });
    },
  });
}

async function redeemBetaAccess(code: string) {
  const res = await apiFetch("/api/billing/beta/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.code || "Erro ao resgatar código beta");
  }
  return data;
}

export function useRedeemBetaAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: redeemBetaAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "status"] });
    },
  });
}

export interface CreditTransaction {
  id: string;
  userId: string;
  workspaceId: string;
  campaignId: string | null;
  campaignName: string | null;
  derivationId: string | null;
  amount: number;
  type: "usage" | "refund" | "grant" | "purchase";
  description: string | null;
  createdAt: string | null;
}

export interface CreditHistorySummary {
  totalSpent: number;
  remainingCredits: number;
  averagePerCampaign: number;
  transactionCount: number;
}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  summary: CreditHistorySummary;
  campaigns: Array<{ id: string; name: string }>;
}

async function fetchCreditHistory(params?: {
  from?: string;
  to?: string;
  campaignId?: string;
}): Promise<CreditHistoryResponse> {
  const url = new URL("/api/billing/history", window.location.origin);
  if (params?.from) url.searchParams.set("from", params.from);
  if (params?.to) url.searchParams.set("to", params.to);
  if (params?.campaignId) url.searchParams.set("campaignId", params.campaignId);

  const res = await apiFetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar histórico");
  }
  return res.json();
}

export function useCreditHistory(params?: {
  from?: string;
  to?: string;
  campaignId?: string;
}) {
  return useQuery({
    queryKey: ["billing", "history", params],
    queryFn: () => fetchCreditHistory(params),
    staleTime: STALE_TIME.SEMI_STATIC,
  });
}
