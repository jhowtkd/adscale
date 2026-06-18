"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { AlertTriangle, Calculator, CreditCard, DollarSign, ShieldCheck, TrendingUp, Check, Zap, Crown, Sparkles, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  brlCurrency,
  calculateForecast,
  pricingAssumptions,
  USD_BRL_PLANNING_RATE,
  usdCurrency,
} from "./pricing-model";
import {
  useBillingPortal,
  useBillingStatus,
  useCreditHistory,
  useRedeemBetaAccess,
  useStartCheckout,
  type BillingStatus,
} from "@/lib/hooks/use-billing";

const planConfig = {
  starter: { name: "Starter", credits: 30, price: "R$ 29/mês", icon: Zap, color: "var(--text-secondary)" },
  growth: { name: "Growth", credits: 120, price: "R$ 79/mês", icon: TrendingUp, color: "var(--accent-green)" },
  scale: { name: "Scale", credits: 360, price: "R$ 199/mês", icon: Crown, color: "var(--accent-amber)" },
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
  if (subscription?.planKey) {
    const planName =
      planConfig[subscription.planKey as keyof typeof planConfig]?.name ?? subscription.planKey;
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
  const redeemBeta = useRedeemBetaAccess();
  const [betaCode, setBetaCode] = useState("");
  const [betaError, setBetaError] = useState("");
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
  const isTrialing = subscriptionStatus === "trialing";
  const isActive = subscriptionStatus === "active";
  const isPastDue = subscriptionStatus === "past_due";
  const isCanceled = subscriptionStatus === "canceled";
  const hasPaidPlan = isActive || isTrialing;
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

  async function handleRedeemBeta() {
    setBetaError("");
    try {
      await redeemBeta.mutateAsync(betaCode);
      setBetaCode("");
    } catch (err) {
      setBetaError(err instanceof Error ? err.message : t("noAccess.error"));
    }
  }

  if (isLoading) {
    return (
      <div className="animate-fade-in rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-6 text-sm text-[var(--text-secondary)]">
        {t("loading")}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {t("error")}
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {isPastDue && !isBeta && (
        <div className="rounded-lg border border-[var(--status-amber-bg)] bg-[var(--status-amber-bg)]/30 p-4 text-sm text-[var(--status-amber-text)]">
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
            className="mt-4 h-10 rounded-md bg-[var(--accent-green)] px-4 text-sm font-medium text-[var(--accent-green-on-fill)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {portal.isPending ? t("pastDue.opening") : t("pastDue.action")}
          </button>
        </div>
      )}

      {isCanceled && !isBeta && (
        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <XCircle size={16} className="text-destructive" />
            {t("canceled.title")}
          </div>
          <p className="mt-2 text-[var(--text-secondary)]">{t("canceled.body")}</p>
          <button
            type="button"
            onClick={() => checkout.mutate({ planKey: subscription?.planKey as "starter" | "growth" | "scale" | undefined ?? "starter" })}
            disabled={checkout.isPending}
            className="mt-4 h-10 rounded-md bg-[var(--accent-green)] px-4 text-sm font-medium text-[var(--accent-green-on-fill)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkout.isPending ? t("canceled.redirecting") : t("canceled.action")}
          </button>
        </div>
      )}

      {isBeta && (
        <div className="rounded-lg border border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)]/40 p-4 text-sm text-[var(--accent-green-text)]">
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

      {(billingStatus?.creditBalance ?? 0) <= 10 && hasSpendAccess && !isBeta && (
        <div className="rounded-lg border border-[var(--status-amber-bg)] bg-[var(--status-amber-bg)]/30 p-4 text-sm text-[var(--status-amber-text)]">
          {isTrialing
            ? t("lowCredits.trial", { credits: billingStatus?.creditBalance ?? 0 })
            : t("lowCredits.paid", { credits: billingStatus?.creditBalance ?? 0 })}
        </div>
      )}

      {access?.kind === "none" && !isCanceled && (
        <section className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("noAccess.title")}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("noAccess.description")}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t("accessKinds.none")}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={betaCode}
              onChange={(event) => setBetaCode(event.target.value)}
              placeholder={t("noAccess.placeholder")}
              className="h-10 flex-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
            />
            <button
              type="button"
              onClick={handleRedeemBeta}
              disabled={redeemBeta.isPending || !betaCode.trim()}
              className="h-10 shrink-0 rounded-md bg-[var(--accent-green)] px-4 text-sm font-medium text-[var(--accent-green-on-fill)] disabled:opacity-60"
            >
              {redeemBeta.isPending ? t("noAccess.redeeming") : t("noAccess.action")}
            </button>
          </div>
          {betaError ? <p className="mt-2 text-sm text-destructive">{betaError}</p> : null}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Calculator}
          label={t("forecast.campaignCost")}
          value={brlCurrency.format(forecast.campaignCostBrl)}
          caption={`${usdCurrency.format(forecast.campaignCost)} USD`}
        />
        <MetricCard
          icon={TrendingUp}
          label={t("forecast.monthlyCost")}
          value={brlCurrency.format(forecast.monthlyCostBrl)}
          caption={`${campaignsPerMonth}/mo`}
        />
        <MetricCard
          icon={ShieldCheck}
          label={t("forecast.cushion")}
          value={brlCurrency.format(forecast.cushionBrl)}
          caption={t("forecast.cushionCaption")}
        />
        <MetricCard
          icon={DollarSign}
          label={t("forecast.imageCost")}
          value={brlCurrency.format(forecast.imageCostBrl)}
          caption={`${usdCurrency.format(forecast.imageCost)} USD`}
        />
      </div>

      {!hasSpendAccess && (
        <section className="space-y-4">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("plans.title")}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{t("plans.subtitle")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.entries(planConfig) as [keyof typeof planConfig, (typeof planConfig)["starter"]][]).map(
              ([key, plan]) => (
                <div
                  key={key}
                  className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-md" style={{ background: `${plan.color}20`, color: plan.color }}>
                    <plan.icon size={20} />
                  </div>
                  <h4 className="text-base font-semibold text-[var(--text-primary)]">{plan.name}</h4>
                  <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{plan.price}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{plan.credits} credits/mo</p>
                  <ul className="mt-4 space-y-2">
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: plan.color }} />
                      {t("plans.features.plans")}
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: plan.color }} />
                      {t("plans.features.derivations")}
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: plan.color }} />
                      {t("plans.features.export")}
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => checkout.mutate({ planKey: key })}
                    disabled={checkout.isPending}
                    className="mt-5 h-10 w-full rounded-md text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ background: plan.color }}
                  >
                    {checkout.isPending ? t("plans.redirecting") : t("plans.startTrial")}
                  </button>
                </div>
              )
            )}
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("forecast.title")}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("forecast.subtitle")}</p>
            </div>
            <span className="rounded-full bg-[var(--accent-green-dim)] px-2.5 py-1 text-xs font-medium text-[var(--accent-green-text)]">
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
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-[var(--accent-green)]" />
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("financial.title")}</h3>
              {isTrialing && (
                <span className="ml-auto rounded-full bg-[var(--status-amber-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-amber-text)]">
                  {t("financial.trialBadge")}
                </span>
              )}
            </div>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
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
            {hasPaidPlan || isPastDue ? (
              <>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => portal.mutate()}
                    disabled={portal.isPending}
                    className="h-10 flex-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--border-medium)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {portal.isPending ? t("financial.opening") : t("financial.manageBilling")}
                  </button>
                  {!isPastDue ? (
                    <button
                      type="button"
                      onClick={() => checkout.mutate({ planKey: "growth" })}
                      disabled={checkout.isPending}
                      className="h-10 flex-1 rounded-md bg-[var(--accent-green)] text-sm font-medium text-[var(--accent-green-on-fill)] transition-all hover:bg-[var(--accent-green-light)] disabled:opacity-60"
                    >
                      {checkout.isPending ? t("plans.redirecting") : t("financial.upgrade")}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => router.replace("/settings?tab=creditHistory", { scroll: false })}
                  className="mt-3 h-10 w-full rounded-md border border-[var(--border-dim)] bg-transparent text-sm font-medium text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)]"
                >
                  {t("financial.viewUsageHistory")}
                </button>
              </>
            ) : (
              <>
                {!isBeta && !isCanceled ? (
                  <button
                    type="button"
                    onClick={() => checkout.mutate({ planKey: "starter" })}
                    disabled={checkout.isPending}
                    className="mt-5 h-10 w-full rounded-md bg-[var(--accent-green)] text-sm font-medium text-[var(--accent-green-on-fill)] transition-all hover:bg-[var(--accent-green-light)] disabled:opacity-60"
                  >
                    {checkout.isPending ? t("plans.redirecting") : t("financial.startTrial")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => router.replace("/settings?tab=creditHistory", { scroll: false })}
                  className="mt-3 h-10 w-full rounded-md border border-[var(--border-dim)] bg-transparent text-sm font-medium text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)]"
                >
                  {t("financial.viewUsageHistory")}
                </button>
              </>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("grants.title")}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("grants.subtitle")}</p>
            {grantsLoading ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">{t("loading")}</p>
            ) : grants.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">{t("grants.empty")}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
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
          </div>

          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("blockingRules.title")}</h3>
            <div className="mt-4 grid gap-3">
              <Spec title="80%" text={t("blockingRules.eighty")} />
              <Spec title="100%" text={t("blockingRules.hundred")} />
              <Spec title="+20%" text={t("blockingRules.overrun")} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Calculator;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
      <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]">
        <Icon size={18} />
      </div>
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{caption}</p>
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
        className="h-9 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green-dim)0.15)]"
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
    <div className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}
