"use client";

import { useMemo, useReducer } from "react";
import { Calculator, CreditCard, DollarSign, ShieldCheck, TrendingUp, Check, Zap, Crown } from "lucide-react";
import {
  brlCurrency,
  calculateForecast,
  pricingAssumptions,
  USD_BRL_PLANNING_RATE,
  usdCurrency,
} from "./pricing-model";
import { useBillingPortal, useBillingStatus, useStartCheckout } from "@/lib/hooks/use-billing";
import { useRouter } from "next/navigation";

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

export default function BillingTab() {
  const router = useRouter();
  const { data: billingStatus } = useBillingStatus();
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
  const isTrialing = subscription?.status === "trialing";
  const isActive = subscription?.status === "active";
  const hasPlan = isActive || isTrialing;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Credit balance alert */}
      {(billingStatus?.creditBalance ?? 0) <= 10 && hasPlan && (
        <div className="rounded-lg border border-[var(--status-amber-bg)] bg-[var(--status-amber-bg)]/30 p-4 text-sm text-[var(--status-amber-text)]">
          ⚠️ Você está com poucos créditos ({billingStatus?.creditBalance ?? 0} restantes).
          {isTrialing ? " Seu trial termina em breve." : " Considere fazer um upgrade de plano."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Calculator}
          label="Custo por campanha"
          value={brlCurrency.format(forecast.campaignCostBrl)}
          caption={`${usdCurrency.format(forecast.campaignCost)} em USD`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Custo mensal previsto"
          value={brlCurrency.format(forecast.monthlyCostBrl)}
          caption={`${campaignsPerMonth} campanhas/mês`}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Orçamento com folga"
          value={brlCurrency.format(forecast.cushionBrl)}
          caption="25% de reserva operacional"
        />
        <MetricCard
          icon={DollarSign}
          label="Custo por imagem"
          value={brlCurrency.format(forecast.imageCostBrl)}
          caption={`${usdCurrency.format(forecast.imageCost)} em USD`}
        />
      </div>

      {!hasPlan && (
        <section className="space-y-4">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Escolha um plano</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Todos os planos incluem <strong>14 dias de trial gratuito</strong>. Cancele a qualquer momento.
          </p>
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
                  <p className="text-sm text-[var(--text-secondary)]">{plan.credits} créditos/mês</p>
                  <ul className="mt-4 space-y-2">
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: plan.color }} />
                      Geração de planos criativos
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: plan.color }} />
                      Derivações de imagem
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check size={14} style={{ color: plan.color }} />
                      Exportação em ZIP
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => checkout.mutate(key)}
                    disabled={checkout.isPending}
                    className="mt-5 h-10 w-full rounded-md text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ background: plan.color }}
                  >
                    {checkout.isPending ? "Redirecionando..." : "Começar trial"}
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
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Simulador de custo
              </h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Ajuste os volumes para prever custo operacional antes de liberar créditos.
              </p>
            </div>
            <span className="rounded-full bg-[var(--accent-green-dim)] px-2.5 py-1 text-xs font-medium text-[var(--accent-green)]">
              R$ {USD_BRL_PLANNING_RATE.toFixed(2)}/US$
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Campanhas por mês" value={campaignsPerMonth} onChange={(value) => updateForecastInputs({ campaignsPerMonth: value })} />
            <NumberField label="Imagens por campanha" value={imagesPerCampaign} onChange={(value) => updateForecastInputs({ imagesPerCampaign: value })} />
            <NumberField label="Tokens input do plano" value={planInputTokens} onChange={(value) => updateForecastInputs({ planInputTokens: value })} />
            <NumberField label="Tokens output do plano" value={planOutputTokens} onChange={(value) => updateForecastInputs({ planOutputTokens: value })} />
            <NumberField label="Texto por imagem" value={imageTextTokens} onChange={(value) => updateForecastInputs({ imageTextTokens: value })} />
            <NumberField label="Imagem de referência" value={referenceImageTokens} onChange={(value) => updateForecastInputs({ referenceImageTokens: value })} />
            <NumberField label="Imagem gerada" value={generatedImageTokens} onChange={(value) => updateForecastInputs({ generatedImageTokens: value })} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-[var(--accent-green)]" />
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Controle financeiro
              </h3>
              {isTrialing && (
                <span className="ml-auto rounded-full bg-[var(--status-amber-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-amber-text)]">
                  Trial
                </span>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <Line label="Plano atual" value={subscription?.planKey ? planConfig[subscription.planKey as keyof typeof planConfig]?.name ?? subscription.planKey : "Sem plano ativo"} />
              <Line label="Status" value={isTrialing ? "Trial (14 dias)" : subscription?.status ?? "Inativo"} />
              <Line label="Créditos disponíveis" value={`${billingStatus?.creditBalance ?? 0}`} />
              <Line label="Renovação" value={subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR") : "-"} />
            </div>
            {hasPlan ? (
              <>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => portal.mutate()}
                    disabled={portal.isPending}
                    className="h-10 flex-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--border-medium)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {portal.isPending ? "Abrindo..." : "Gerenciar cobrança"}
                  </button>
                  <button
                    type="button"
                    onClick={() => checkout.mutate("growth")}
                    disabled={checkout.isPending}
                    className="h-10 flex-1 rounded-md bg-[var(--accent-green)] text-sm font-medium text-white transition-all hover:bg-[var(--accent-green-light)] disabled:opacity-60"
                  >
                    {checkout.isPending ? "Redirecionando..." : "Fazer upgrade"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => router.replace("/settings?tab=creditHistory", { scroll: false })}
                  className="mt-3 h-10 w-full rounded-md border border-[var(--border-dim)] bg-transparent text-sm font-medium text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)]"
                >
                  Ver histórico de uso →
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => checkout.mutate("starter")}
                  disabled={checkout.isPending}
                  className="mt-5 h-10 w-full rounded-md bg-[var(--accent-green)] text-sm font-medium text-white transition-all hover:bg-[var(--accent-green-light)] disabled:opacity-60"
                >
                  {checkout.isPending ? "Redirecionando..." : "Começar trial grátis"}
                </button>
                <button
                  type="button"
                  onClick={() => router.replace("/settings?tab=creditHistory", { scroll: false })}
                  className="mt-3 h-10 w-full rounded-md border border-[var(--border-dim)] bg-transparent text-sm font-medium text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)]"
                >
                  Ver histórico de uso →
                </button>
              </>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Regras de bloqueio
            </h3>
            <div className="mt-4 grid gap-3">
              <Spec title="80%" text="Mostrar alerta preventivo para o workspace." />
              <Spec title="100%" text="Bloquear novas gerações ou pedir upgrade." />
              <Spec title="+20%" text="Revisar preço se custo real passar do estimado." />
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
      <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-[var(--accent-green-dim)] text-[var(--accent-green)]">
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
