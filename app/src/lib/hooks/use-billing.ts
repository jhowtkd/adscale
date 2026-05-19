import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface BillingStatus {
  hasCustomer: boolean;
  subscription: {
    status: string;
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

async function startCheckout(planKey: "starter" | "growth" | "scale") {
  const res = await apiFetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey }),
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
  return useMutation({
    mutationFn: openBillingPortal,
  });
}

