import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

export type BillingAccessKind = "paid" | "trial" | "beta" | "tester" | "none";

/**
 * Workspace membership role of the current user. Surfaced on the billing
 * status payload so client-side role gates (e.g. /feedback) can react to it
 * without a separate request. Mirrors `WorkspaceMemberRole`.
 */
export type BillingAccessRole = "owner" | "admin" | "member";

export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "none";

export type PastDueRecoveryAction = "portal";
export type PastDueSpendPolicy = "existing_credits_spendable";
export type CanceledRecoveryAction = "checkout";

export interface BillingStatus {
  hasCustomer: boolean;
  subscriptionStatus: BillingSubscriptionStatus;
  access: {
    kind: BillingAccessKind;
    /**
     * Workspace membership role of the current user (`owner`/`admin`/`member`).
     * May be absent for legacy/edge payloads; treat absence as non-privileged.
     */
    role?: BillingAccessRole;
    label: string;
    remainingAds: number | null;
    hasSpendAccess: boolean;
    /**
     * True when the workspace settles usage without debiting credits, per the
     * canonical `workspaceHasUnlimitedBillingAccess` policy. Absent in legacy
     * payloads, which must be treated as limited access.
     */
    unlimited?: boolean;
    beta: {
      totalAds: number;
      remainingAds: number;
      exhausted: boolean;
    } | null;
    trial?: {
      status: "pending_verification" | "active";
    } | null;
  };
  pastDue: {
    recoveryAction: PastDueRecoveryAction;
    spendPolicy: PastDueSpendPolicy;
  } | null;
  canceled: {
    recoveryAction: CanceledRecoveryAction;
  } | null;
  subscription: {
    status: BillingSubscriptionStatus;
    rawStatus: string;
    planKey: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  creditBalance: number;
  /**
   * The workspace's free plan (ticket 11, part 2), decided by the server's one rule: null when it is not on it;
   * `accountId` null when it has no free account; `closedAccountId` when its accounts are all closed. Absent in legacy
   * payloads: unknown.
   */
  freePlan?: { accountId: string | null; closedAccountId?: string } | null;
}

export async function fetchBillingStatusOnce(): Promise<BillingStatus> {
  const res = await apiFetch("/api/billing/status");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar cobrança");
  }
  const data = await res.json();
  return data.billing;
}

async function activateSignupTrialClient(): Promise<void> {
  const res = await apiFetch("/api/billing/trial/activate", {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.code || "Erro ao ativar trial");
  }
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const initial = await fetchBillingStatusOnce();
  if (initial.access?.trial?.status === "pending_verification") {
    await activateSignupTrialClient();
    return fetchBillingStatusOnce();
  }
  return initial;
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

export interface CreditGrantRecord {
  id: string;
  source: string;
  amount: number;
  remaining: number;
  createdAt: string | null;
}

export interface CreditUsagePoint {
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  amount: number;
}

export type CreditHistoryParams = {
  from?: string;
  to?: string;
  campaignId?: string;
};

/**
 * One page of `GET /api/billing/history`. `summary`, `usageSeries` and
 * `campaigns` come only on the first page and cover the whole filtered set.
 */
export interface CreditHistoryPage {
  transactions: CreditTransaction[];
  nextCursor: string | null;
  summary?: CreditHistorySummary;
  usageSeries?: CreditUsagePoint[];
  campaigns?: Array<{ id: string; name: string }>;
}

export interface CreditGrantsPage {
  grants: CreditGrantRecord[];
  nextCursor: string | null;
}

/** The loaded pages, flattened; the totals come from the first page. */
export interface CreditHistoryData {
  transactions: CreditTransaction[];
  summary: CreditHistorySummary | undefined;
  usageSeries: CreditUsagePoint[];
  campaigns: Array<{ id: string; name: string }>;
}

async function fetchBillingHistoryPage<T>(
  search: Record<string, string | undefined>,
  cursor: string | null
): Promise<T> {
  const url = new URL("/api/billing/history", window.location.origin);
  for (const [key, value] of Object.entries(search)) {
    if (value) url.searchParams.set(key, value);
  }
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await apiFetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar histórico");
  }
  return res.json();
}

function selectCreditHistory(data: InfiniteData<CreditHistoryPage>): CreditHistoryData {
  const first = data.pages[0];
  return {
    transactions: data.pages.flatMap((page) => page.transactions),
    summary: first?.summary,
    usageSeries: first?.usageSeries ?? [],
    campaigns: first?.campaigns ?? [],
  };
}

function selectCreditGrants(data: InfiniteData<CreditGrantsPage>): CreditGrantRecord[] {
  return data.pages.flatMap((page) => page.grants);
}

/** Ledger pages for the filters; a filter change starts over from page 1. */
export function useCreditHistory(params?: CreditHistoryParams) {
  return useInfiniteQuery({
    queryKey: ["billing", "history", "transactions", params ?? {}],
    queryFn: ({ pageParam }) =>
      fetchBillingHistoryPage<CreditHistoryPage>({ ...params }, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: selectCreditHistory,
    staleTime: STALE_TIME.SEMI_STATIC,
  });
}

/** Credit grants (`view=grants`), all-time, without touching the ledger. */
export function useCreditGrants() {
  return useInfiniteQuery({
    queryKey: ["billing", "history", "grants"],
    queryFn: ({ pageParam }) =>
      fetchBillingHistoryPage<CreditGrantsPage>({ view: "grants" }, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: selectCreditGrants,
    staleTime: STALE_TIME.SEMI_STATIC,
  });
}
