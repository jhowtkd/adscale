"use client";

import { usePathname } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MissionCreditContext, MissionCreditInfo } from "@/lib/progression/missions/types";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { resolveConversionGateFromBilling } from "@/lib/billing/conversion-client";
import { ConversionCta } from "@/components/billing/ConversionCta";

interface MissionCreditBannerProps {
  credit?: MissionCreditInfo;
  creditContext?: MissionCreditContext;
}

export function MissionCreditBanner({
  credit,
  creditContext,
}: MissionCreditBannerProps) {
  const t = useTranslations("dashboard.missions.credits");
  const pathname = usePathname();
  const { data: billingStatus } = useBillingStatus();

  if (!credit || !creditContext) return null;

  const { showUpgradePrompt } = creditContext;
  if (!credit.insufficientCredits && !showUpgradePrompt) return null;

  const conversionPayload = showUpgradePrompt
    ? resolveConversionGateFromBilling({
        billing: billingStatus,
        requiredCredits: credit.creditCost,
        returnPath: pathname,
        operation: "mission_upgrade",
      })
    : null;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]/50 p-3">
      <p className="flex items-center gap-2 text-xs text-[var(--danger-text)]">
        <AlertCircle size={14} aria-hidden="true" />
        {credit.insufficientCredits ? t("insufficient") : t("upgradeHint")}
      </p>
      {conversionPayload ? (
        <ConversionCta payload={conversionPayload} className="w-full" />
      ) : null}
    </div>
  );
}
