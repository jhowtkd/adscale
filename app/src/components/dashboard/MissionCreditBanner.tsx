"use client";

import { usePathname } from "next/navigation";
import { Coins, AlertCircle } from "lucide-react";
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
  const tConversion = useTranslations("billing.conversion");
  const pathname = usePathname();
  const { data: billingStatus } = useBillingStatus();

  if (!credit || !creditContext) return null;

  const { remainingCredits, remainingAds, showUpgradePrompt } = creditContext;
  const costKey = credit.costLabel === "from" ? "costFrom" : "costSingle";

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
      <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
        <Coins size={14} className="mt-0.5 shrink-0 text-[var(--utility-icon)]" aria-hidden="true" />
        <p>{t(costKey, { ads: credit.adCost, credits: credit.creditCost })}</p>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[var(--text-muted)]">
          {t("balance", {
            ads: remainingAds ?? 0,
            credits: remainingCredits,
          })}
        </span>
        {credit.insufficientCredits ? (
          <span className="inline-flex items-center gap-1 text-[var(--danger-text)]">
            <AlertCircle size={12} aria-hidden="true" />
            {t("insufficient")}
          </span>
        ) : null}
      </div>
      {conversionPayload ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">
            {tConversion(`reasons.${conversionPayload.reason}`)}
          </p>
          <ConversionCta payload={conversionPayload} className="w-full" />
        </div>
      ) : showUpgradePrompt ? (
        <p className="text-xs text-[var(--text-secondary)]">{t("upgradeHint")}</p>
      ) : null}
    </div>
  );
}
