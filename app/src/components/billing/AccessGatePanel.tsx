"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useBillingStatus,
  useStartCheckout,
} from "@/lib/hooks/use-billing";
import { FreePlanCta } from "@/components/billing/FreePlanCta";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";

export function AccessGatePanel() {
  const t = useTranslations("billing.accessGate");
  const { data: billing, isLoading } = useBillingStatus();
  const checkout = useStartCheckout();
  // Ticket 11, part 2: on the free plan the way on is the plan request, never the classic checkout.
  const freePlan = useFreePlanAccount();

  if (isLoading || !billing || freePlan === undefined) return null;
  if (freePlan) return <FreePlanCta accountId={freePlan.accountId} />;
  if (billing.access.hasSpendAccess) return null;

  const handleCheckout = async () => {
    try {
      await checkout.mutateAsync({ planKey: "starter", returnPath: "/" });
    } catch {
      // erro de checkout é exibido pelo bloco checkout.isError abaixo
    }
  };

  return (
    <section
      aria-labelledby="access-gate-title"
      className="rounded-[var(--radius-object)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-5 sm:p-6"
    >
      <h2
        id="access-gate-title"
        className="text-base font-semibold text-[var(--text-primary)]"
      >
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("description")}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={checkout.isPending}
        >
          {checkout.isPending ? t("redirecting") : t("checkout")}
        </Button>
      </div>

      {checkout.isError ? (
        <p className="mt-2 text-xs text-[var(--danger-text)]">
          {checkout.error instanceof Error ? checkout.error.message : t("checkoutError")}
        </p>
      ) : null}
    </section>
  );
}
