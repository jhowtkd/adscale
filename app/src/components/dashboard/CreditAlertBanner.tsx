"use client";

import Link from "next/link";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight } from "lucide-react";

export function CreditAlertBanner() {
  const { data: billing } = useBillingStatus();
  const subscription = billing?.subscription;
  const isTrialing = subscription?.status === "trialing";
  const isActive = subscription?.status === "active";
  const hasPlan = isActive || isTrialing;
  const balance = billing?.creditBalance ?? 0;
  const lowCredits = balance <= 10 && hasPlan;
  const noPlan = !hasPlan;

  if (!lowCredits && !noPlan) return null;

  return (
    <div
      className={cn(
        "rounded-lg border px-5 py-4 text-sm flex items-center justify-between gap-4 animate-fade-in",
        noPlan
          ? "border-[var(--accent-mint)]/30 bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
          : "border-[var(--status-amber-bg)] bg-[var(--status-amber-bg)]/30 text-[var(--status-amber-text)]"
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} />
        <span>
          {noPlan
            ? "Você ainda não tem um plano ativo. Comece seu trial gratuito de 14 dias."
            : `Você está com poucos créditos (${balance} restantes). Considere fazer um upgrade de plano.`}
        </span>
      </div>
      <Link
        href="/settings"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all",
          noPlan
            ? "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)]"
            : "bg-[var(--status-amber-text)] text-white hover:opacity-90"
        )}
      >
        {noPlan ? "Começar trial" : "Fazer upgrade"}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
