"use client";

import { useEffect, useMemo, useReducer } from "react";
import { AlertTriangle, TrendingUp, Check, Zap, Crown, Sparkles, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  brlCurrency,
  calculateForecast,
  planTiers,
  pricingAssumptions,
  USD_BRL_PLANNING_RATE,
  usdCurrency,
} from "./pricing-model";
import {
  useBillingPortal,
  useBillingStatus,
  useCreditHistory,
  useStartCheckout,
  type BillingStatus,
} from "@/lib/hooks/use-billing";
import { LOW_CREDIT_THRESHOLD } from "@/lib/billing/credit-units";
import {
  settingsButtonClass,
  settingsFieldClass,
  settingsHintClass,
  settingsSectionTitleClass,
} from "@/components/settings/settings-chrome";

const paidPlanTiers = planTiers.filter((tier) => !tier.trial);

const tierVisuals: Record<string, { icon: typeof Zap; color: string }> = {
  starter: { icon: Zap, color: "var(--text-secondary)" },
  growth: { icon: TrendingUp, color: "var(--utility-icon)" },
  scale: { icon: Crown, color: "var(--utility-icon)" },
};

type ForecastInputs = typeof pricingAssumptions;

function forecastReducer(
  state: ForecastInputs,
  payload: Partial<ForecastInputs>
): ForecastInputs {
  return { ...state, ...payload };
}

function formatBillingDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function resolveAccessLabel(
  billingStatus: BillingStatus | undefined,
  t: ReturnType<typeof useTranslations<"billing.account">>
) {
  const access = billingStatus?.access;
  const subscription = billingStatus?.subscription;
  if (access?.kind === "beta") {
    return t("accessLabels.beta", { remaining: access.remainingAds ?? 0 });
  }
  if (access?.kind === "tester") {
    return t("accessLabels.tester");
  }
  if (access?.kind === "trial") {
    return t("accessLabels.trial");
  }
  if (subscription?.planKey) {
    const tier = planTiers.find((t) => t.key === subscription.planKey);
    const planName = tier?.name ?? subscription.planKey;
    return t("accessLabels.plan", { plan: planName });
  }
  return t("accessLabels.noPlan");
}

function resolveStatusLabel(
  billingStatus: BillingStatus | undefined,
  t: ReturnType<typeof useTranslations<"billing.account">>
) {
  const access = billingStatus?.access;
  const status = billingStatus?.subscriptionStatus;
  if (access?.kind === "beta") return t("statusLabels.beta");
  if (access?.kind === "tester") return t("statusLabels.tester");
  if (access?.kind === "trial") return t("statusLabels.trial");
  if (status === "past_due") return t("statusLabels.pastDue");
  if (status === "canceled") return t("statusLabels.canceled");
  if (status === "trialing") return t("statusLabels.trial");
  if (status === "active") return t("statusLabels.active");
  return t("statusLabels.inactive");
}

function resolveRenewalLabel(
  billingStatus: BillingStatus | undefined,
  t: ReturnType<typeof useTranslations<"billing.account">>
) {
  if (billingStatus?.subscriptionStatus === "trialing") return t("financial.trialEnds");
  if (billingStatus?.subscriptionStatus === "active") return t("financial.nextRenewal");
  return t("financial.renewal");
}

export default function BillingTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const t = useTranslations("billing.account");
  const { data: billingStatus, isLoading, isError } = useBillingStatus();
  const { data: creditHistory, isLoading: grantsLoading } = useCreditHistory();
  const portal = useBillingPortal();
  const checkout = useStartCheckout();
  const [forecastInputs, updateForecastInputs] = useReducer(forecastReducer, pricingAssumptions);
  const {
    campaignsPerMonth,
    imagesPerCampaign,
    planInputTokens,
    planOutputTokens,
    imageTextTokens,
    referenceImageTokens,
    generatedImageTokens,
  } = forecastInputs;

  const forecast = useMemo(
    () =>
      calculateForecast({
        campaignsPerMonth,
        imagesPerCampaign,
        planInputTokens,
        planOutputTokens,
        imageTextTokens,
        referenceImageTokens,
        generatedImageTokens,
      }),
    [
      campaignsPerMonth,
      generatedImageTokens,
      imageTextTokens,
      imagesPerCampaign,
      planInputTokens,
      planOutputTokens,
      referenceImageTokens,
    ]
  );

  const subscription = billingStatus?.subscription;
  const access = billingStatus?.access;
  const subscriptionStatus = billingStatus?.subscriptionStatus ?? "none";
  const isPaidSubscriptionTrial = subscriptionStatus === "trialing";
  const isSignupTrial = access?.kind === "trial";
  const isTrialing = isPaidSubscriptionTrial || isSignupTrial;
  const isActive = subscriptionStatus === "active";
  const isPastDue = subscriptionStatus === "past_due";
  const isCanceled = subscriptionStatus === "canceled";
  const hasPaidPlan = isActive || isPaidSubscriptionTrial;
  const isBeta = access?.kind === "beta";
  const hasSpendAccess = access?.hasSpendAccess ?? (hasPaidPlan || isBeta);
  const grants = creditHistory?.grants ?? [];
  const renewalDate = formatBillingDate(subscription?.currentPeriodEnd, locale);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    void queryClient.invalidateQueries({ queryKey: ["billing", "status"] });
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("checkout");
    const query = nextParams.toString();
    router.replace(query ? `/settings?${query}` : "/settings?tab=billing", { scroll: false });
  }, [queryClient, router, searchParams]);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-[var(--danger-text)]">{t("error")}</p>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {isPastDue && !isBeta && (
        <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            {t("pastDue.title")}
          </div>
          <p className="mt-2 text-[var(--text-secondary)]">
            {t("pastDue.body", { credits: billingStatus?.creditBalance ?? 0 })}
          </p>
          <button
            type="button"
            onClick={() => portal.mutate()}
            disabled={portal.isPending || !billingStatus?.hasCustomer}
            className={`mt-4 ${settingsButtonClass}`}
          >
            {portal.isPending ? t("pastDue.opening") : t("pastDue.action")}
          </button>
        </div>
      )}

      {isCanceled && !isBeta && (
        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <XCircle size={16} className="text-[var(--danger-text)]" />
            {t("canceled.title")}
          </div>
          <p className="mt-2 text-[var(--text-secondary)]">{t("canceled.body")}</p>
          <button
            type="button"
            onClick={() => checkout.mutate({ planKey: subscription?.planKey as "starter" | "growth" | "scale" | undefined ?? "starter" })}
            disabled={checkout.isPending}
            className={`mt-4 ${settingsButtonClass}`}
          >
            {checkout.isPending ? t("canceled.redirecting") : t("canceled.action")}
          </button>
        </div>
      )}

      {isBeta && (
        <div className="rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] p-4 text-sm text-[var(--success-text)]">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles size={16} />
            {t("beta.title")}
          </div>
          <p className="mt-2 text-[var(--text-secondary)]">
            {t("beta.body", {
              remaining: access?.remainingAds ?? 0,
              total: access?.beta?.totalAds ?? 10,
            })}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t("accessKinds.beta")}</p>
        </div>
      )}

      {(billingStatus?.creditBalance ?? 0) <= LOW_CREDIT_THRESHOLD && hasSpendAccess && !isBeta && (
        <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]">
          {isTrialing
            ? t("lowCredits.trial", { credits: billingStatus?.creditBalance ?? 0 })
            : t("lowCredits.paid", { credits: billingStatus?.creditBalance ?? 0 })}
        </div>
      )}

      {!hasSpendAccess && (
        <section className="space-y-4">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("plans.title")}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{t("plans.subtitle")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {paidPlanTiers.map((tier) => {
              const visuals = tierVisuals[tier.key] ?? { icon: Zap, color: "var(--text-secondary)" };
              const Icon = visuals.icon;
              return (
                <div
                  key={tier.key}
                  className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 transition-colors hover:border-[var(--border-medium)]"
                >
                  <div
                    className="mb-4 flex size-10 items-center justify-center rounded-md"
                    style={{ background: `${visuals.color}20`, color: visuals.color }}
                  >
                    <Icon size={20} />
                  </div>
                  <h4 className="text-base font-semibold text-[var(--text-primary)]">{tier.name}</h4>
                  <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                    {brlCurrency.format(tier.priceBrl)}/{tier.period}
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {tier.credits.toLocaleString("pt-BR")} créditos/mês
                  </p>
                  <ul className="mt-4 space-y-2">
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: visuals.color }} />
                      {t("plans.features.plans")}
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: visuals.color }} />
                      {t("plans.features.derivations")}
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: visuals.color }} />
                      {t("plans.features.export")}
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => checkout.mutate({ planKey: tier.key as "starter" | "growth" | "scale" })}
                    disabled={checkout.isPending}
                    className={`mt-5 w-full ${settingsButtonClass}`}
                  >
                    {checkout.isPending ? t("plans.redirecting") : t("plans.startTrial")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="divide-y divide-[var(--border-dim)]">
        <section className="space-y-4 pb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={settingsSectionTitleClass}>{t("forecast.title")}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("forecast.subtitle")}</p>
            </div>
            <span className={settingsHintClass}>
              R$ {USD_BRL_PLANNING_RATE.toFixed(2)}/US$
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label={t("forecast.campaignsPerMonth")} value={campaignsPerMonth} onChange={(value) => updateForecastInputs({ campaignsPerMonth: value })} />
            <NumberField label={t("forecast.imagesPerCampaign")} value={imagesPerCampaign} onChange={(value) => updateForecastInputs({ imagesPerCampaign: value })} />
            <NumberField label={t("forecast.planInput")} value={planInputTokens} onChange={(value) => updateForecastInputs({ planInputTokens: value })} />
            <NumberField label={t("forecast.planOutput")} value={planOutputTokens} onChange={(value) => updateForecastInputs({ planOutputTokens: value })} />
            <NumberField label={t("forecast.imageText")} value={imageTextTokens} onChange={(value) => updateForecastInputs({ imageTextTokens: value })} />
            <NumberField label={t("forecast.reference")} value={referenceImageTokens} onChange={(value) => updateForecastInputs({ referenceImageTokens: value })} />
            <NumberField label={t("forecast.generatedImage")} value={generatedImageTokens} onChange={(value) => updateForecastInputs({ generatedImageTokens: value })} />
          </div>

          <dl className="space-y-2 pt-2 text-sm">
            <ForecastRow
              label={t("forecast.campaignCost")}
              value={brlCurrency.format(forecast.campaignCostBrl)}
              caption={`${usdCurrency.format(forecast.campaignCost)} USD`}
            />
            <ForecastRow
              label={t("forecast.monthlyCost")}
              value={brlCurrency.format(forecast.monthlyCostBrl)}
              caption={`${campaignsPerMonth}/mo`}
            />
            <ForecastRow
              label={t("forecast.cushion")}
              value={brlCurrency.format(forecast.cushionBrl)}
              caption={t("forecast.cushionCaption")}
            />
            <ForecastRow
              label={t("forecast.imageCost")}
              value={brlCurrency.format(forecast.imageCostBrl)}
              caption={`${usdCurrency.format(forecast.imageCost)} USD`}
            />
          </dl>
        </section>

        <section className="space-y-4 py-8">
          <div className="flex items-baseline gap-2">
            <h3 className={settingsSectionTitleClass}>{t("financial.title")}</h3>
            {isTrialing && (
              <span className={settingsHintClass}>{t("financial.trialBadge")}</span>
            )}
          </div>
          <p className={settingsHintClass}>
            {access?.kind === "paid"
              ? t("accessKinds.paid")
              : access?.kind === "beta"
                ? t("accessKinds.beta")
                : t("accessKinds.none")}
          </p>
          <div className="space-y-3 text-sm">
            <Line label={t("financial.access")} value={resolveAccessLabel(billingStatus, t)} />
            <Line label={t("financial.status")} value={resolveStatusLabel(billingStatus, t)} />
            <Line
              label={isBeta ? t("financial.adsRemaining") : t("financial.generationBalance")}
              value={
                isBeta
                  ? `${access?.remainingAds ?? 0}`
                  : `${billingStatus?.creditBalance ?? 0}`
              }
            />
            {(hasPaidPlan || isPastDue || isCanceled) && (
              <Line
                label={resolveRenewalLabel(billingStatus, t)}
                value={renewalDate}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPaidPlan || isPastDue ? (
              <>
                <button
                  type="button"
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                  className={settingsButtonClass}
                >
                  {portal.isPending ? t("financial.opening") : t("financial.manageBilling")}
                </button>
                {!isPastDue ? (
                  <button
                    type="button"
                    onClick={() => checkout.mutate({ planKey: "growth" })}
                    disabled={checkout.isPending}
                    className={settingsButtonClass}
                  >
                    {checkout.isPending ? t("plans.redirecting") : t("financial.upgrade")}
                  </button>
                ) : null}
              </>
            ) : !isBeta && !isCanceled ? (
              <button
                type="button"
                onClick={() => checkout.mutate({ planKey: "starter" })}
                disabled={checkout.isPending}
                className={settingsButtonClass}
              >
                {checkout.isPending ? t("plans.redirecting") : t("financial.startTrial")}
              </button>
            ) : null}
            <Link href="/settings?tab=creditHistory" className={settingsButtonClass}>
              {t("financial.viewUsageHistory")}
            </Link>
          </div>
        </section>

        <section className="space-y-3 py-8">
          <h3 className={settingsSectionTitleClass}>{t("grants.title")}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{t("grants.subtitle")}</p>
          {grantsLoading ? (
            <p className={settingsHintClass}>{t("loading")}</p>
          ) : grants.length === 0 ? (
            <p className={settingsHintClass}>{t("grants.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-dim)] text-xs text-[var(--text-muted)]">
                    <th className="pb-2 pr-3 font-medium">{t("grants.source")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("grants.amount")}</th>
                    <th className="pb-2 font-medium">{t("grants.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((grant) => (
                    <tr key={grant.id} className="border-b border-[var(--border-dim)] last:border-b-0">
                      <td className="py-2 pr-3 text-[var(--text-primary)]">
                        {t.has(`grants.sources.${grant.source}`)
                          ? t(`grants.sources.${grant.source}` as "grants.sources.stripe_invoice")
                          : grant.source}
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-primary)]">{grant.amount}</td>
                      <td className="py-2 text-[var(--text-secondary)]">
                        {formatBillingDate(grant.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3 pt-8">
          <h3 className={settingsSectionTitleClass}>{t("blockingRules.title")}</h3>
          <dl className="space-y-3 text-sm">
            <Spec title="80%" text={t("blockingRules.eighty")} />
            <Spec title="100%" text={t("blockingRules.hundred")} />
            <Spec title="+20%" text={t("blockingRules.overrun")} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function ForecastRow({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-dim)] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="text-right">
        <span className="font-medium text-[var(--text-primary)]">{value}</span>
        <span className="ml-2 text-xs text-[var(--text-muted)]">{caption}</span>
      </dd>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={settingsFieldClass}
      />
    </label>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border-dim)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function Spec({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-secondary)]">{title}</dt>
      <dd className="max-w-[70%] text-right text-xs leading-relaxed text-[var(--text-secondary)]">{text}</dd>
    </div>
  );
}
