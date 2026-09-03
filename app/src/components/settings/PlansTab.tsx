"use client";

import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import { Check, Crown, Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { brlCurrency, calculateForecast, planTiers } from "./pricing-model";
import { useStartCheckout } from "@/lib/hooks/use-billing";
import { settingsButtonClass } from "@/components/settings/settings-chrome";

const forecast = calculateForecast();

const compareTeamKeys = ["compareDash", "compareDash", "compareTeamBasic", "compareTeamPermissions"] as const;
const compareQueueKeys = ["compareQueueStandard", "compareQueueStandard", "compareQueueStandard", "compareQueuePriority"] as const;

export default function PlansTab() {
  const t = useTranslations("settings.plans");
  const checkout = useStartCheckout();
  const reducedMotion = useReducedMotion();

  async function startPlanCheckout(tierKey: string) {
    if (tierKey !== "starter" && tierKey !== "growth" && tierKey !== "scale") return;
    await checkout.mutateAsync({ planKey: tierKey as "starter" | "growth" | "scale" });
  }

  return (
    <m.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.25 }}
      className="space-y-8"
    >
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {planTiers.map((tier) => {
          const tierKey = tier.key;
          const features = t.raw(`tiers.${tierKey}.features`) as string[];
          const protectedCost = forecast.protectedCampaignCostBrl * tier.campaigns;
          const margin =
            tier.priceBrl > 0 ? Math.round(((tier.priceBrl - protectedCost) / tier.priceBrl) * 100) : null;

          return (
            <article
              key={tierKey}
              className={cn(
                "relative flex flex-col rounded-lg border bg-[var(--surface-base)] p-5",
                tier.recommended
                  ? "border-[var(--selection-border)] shadow-[0_12px_32px_var(--neutral-bg)]"
                  : "border-[var(--border-dim)]"
              )}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    tier.recommended
                      ? "bg-[var(--selection-bg)] text-[var(--selection-text)]"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  )}
                >
                  {t(`tiers.${tierKey}.badge`)}
                </span>
                {tier.recommended ? (
                  <Crown size={16} className="text-[var(--utility-icon)]" aria-hidden="true" />
                ) : (
                  <Package size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
                )}
              </div>

              <h4 className="text-lg font-semibold text-[var(--text-primary)]">{t(`tiers.${tierKey}.name`)}</h4>
              <p className="mt-1 min-h-10 text-sm text-[var(--text-secondary)]">{t(`tiers.${tierKey}.description`)}</p>

              <div className="mt-5">
                <span className="text-3xl font-semibold text-[var(--text-primary)]">
                  {brlCurrency.format(tier.priceBrl)}
                </span>
                <span className="text-sm text-[var(--text-secondary)]">/{t(`tiers.${tierKey}.period`)}</span>
              </div>

              <p className="mt-3 text-xs text-[var(--text-muted)]">
                {t("limitsSummary", {
                  credits: tier.credits,
                  campaigns: tier.campaigns,
                  images: tier.images,
                })}
                {!tier.trial && margin != null ? ` · ${t("statMargin")} ${margin}%` : null}
              </p>

              <ul className="mt-5 flex-1 space-y-2">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                    <Check size={15} className="mt-0.5 shrink-0 text-[var(--utility-icon)]" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => startPlanCheckout(tier.key)}
                disabled={tier.trial || checkout.isPending}
                className={cn("mt-5 w-full", settingsButtonClass)}
              >
                {checkout.isPending ? t("opening") : tier.trial ? t("trialIncluded") : t("selectPlan")}
              </button>
            </article>
          );
        })}
      </div>

      <section className="space-y-3 border-t border-[var(--border-dim)] pt-8">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("compareTitle")}</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-dim)] text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="py-3 pr-4 font-medium">{t("compareResource")}</th>
                {planTiers.map((tier) => (
                  <th key={tier.key} className="px-4 py-3 font-medium">
                    {t(`tiers.${tier.key}.name`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              <CompareRow
                label={t("comparePrice")}
                values={planTiers.map(
                  (tier) => `${brlCurrency.format(tier.priceBrl)}/${t(`tiers.${tier.key}.period`)}`
                )}
              />
              <CompareRow label={t("compareCredits")} values={planTiers.map((tier) => `${tier.credits}`)} />
              <CompareRow label={t("compareCampaigns")} values={planTiers.map((tier) => `${tier.campaigns}`)} />
              <CompareRow label={t("compareImages")} values={planTiers.map((tier) => `${tier.images}`)} />
              <CompareRow
                label={t("compareRestyling")}
                values={planTiers.map(() => t("compareIncluded"))}
              />
              <CompareRow
                label={t("compareTeam")}
                values={compareTeamKeys.map((key) => t(key))}
              />
              <CompareRow
                label={t("compareQueue")}
                values={compareQueueKeys.map((key) => t(key))}
              />
            </tbody>
          </table>
        </div>
      </section>
    </m.div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">{label}</td>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className="px-4 py-3 text-[var(--text-secondary)]">
          {value}
        </td>
      ))}
    </tr>
  );
}
