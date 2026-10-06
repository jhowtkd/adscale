"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";
import { useBillingPortal, useStartCheckout } from "@/lib/hooks/use-billing";
import type { BillingPlanKey } from "@/server/billing/plans";
import { FreePlanCta } from "@/components/billing/FreePlanCta";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";

interface ConversionCtaProps {
  payload: ConversionErrorPayload;
  size?: "sm" | "default";
  className?: string;
}

export function ConversionCta({ payload, size = "sm", className }: ConversionCtaProps) {
  const t = useTranslations("billing.conversion");
  const router = useRouter();
  const checkout = useStartCheckout();
  const portal = useBillingPortal();

  const planKey: BillingPlanKey = payload.suggestedPlan ?? "starter";

  const handleClick = async () => {
    if (payload.recommendedAction === "checkout") {
      await checkout.mutateAsync({
        planKey,
        returnPath: payload.returnPath,
      });
      return;
    }

    if (payload.recommendedAction === "portal") {
      await portal.mutateAsync();
      return;
    }

    const billingPath = payload.returnPath
      ? `/settings?tab=billing&returnPath=${encodeURIComponent(payload.returnPath)}`
      : "/settings?tab=billing";
    router.push(billingPath);
  };

  // The free plan's answer is the plan request of flow 0, not a checkout (ticket 11, part 2): from the payload, or from
  // the plan itself when the payload was worked out on the client (a balance gate knows nothing about the free plan).
  const freePlan = useFreePlanAccount();
  if (payload.recommendedAction === "plan_request" && payload.accountId) {
    return <FreePlanCta accountId={payload.accountId} className={className} />;
  }
  if (freePlan) {
    return <FreePlanCta accountId={freePlan.accountId} className={className} />;
  }
  // No checkout button before the plan is known.
  if (freePlan === undefined) return null;

  const isPending = checkout.isPending || portal.isPending;
  const labelKey = `actions.${payload.recommendedAction}` as const;

  return (
    <Button
      type="button"
      size={size}
      className={className}
      onClick={() => void handleClick()}
      disabled={isPending}
    >
      {isPending ? t("loading") : t(labelKey)}
    </Button>
  );
}
