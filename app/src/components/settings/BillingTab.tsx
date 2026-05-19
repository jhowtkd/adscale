"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calculator, CreditCard, DollarSign, ShieldCheck, TrendingUp } from "lucide-react";
import {
  brlCurrency,
  calculateForecast,
  pricingAssumptions,
  USD_BRL_PLANNING_RATE,
  usdCurrency,
} from "./pricing-model";

export default function BillingTab() {
  const [billingStatus, setBillingStatus] = useState<{
    hasCustomer: boolean;
    subscription: {
      status: string;
      planKey: string;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    } | null;
    creditBalance: number;
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [campaignsPerMonth, setCampaignsPerMonth] = useState(pricingAssumptions.campaignsPerMonth);
  const [imagesPerCampaign, setImagesPerCampaign] = useState(pricingAssumptions.imagesPerCampaign);
  const [planInputTokens, setPlanInputTokens] = useState(pricingAssumptions.planInputTokens);
  const [planOutputTokens, setPlanOutputTokens] = useState(pricingAssumptions.planOutputTokens);
  const [imageTextTokens, setImageTextTokens] = useState(pricingAssumptions.imageTextTokens);
  const [referenceImageTokens, setReferenceImageTokens] = useState(pricingAssumptions.referenceImageTokens);
  const [generatedImageTokens, setGeneratedImageTokens] = useState(pricingAssumptions.generatedImageTokens);

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

  useEffect(() => {
    let mounted = true;
    fetch("/api/billing/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (mounted && data?.billing) setBillingStatus(data.billing);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.code ?? "portal_failed");
      }
      window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
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
            <span className="rounded-full bg-[var(--accent-mint-dim)] px-2.5 py-1 text-xs font-medium text-[var(--accent-mint)]">
              R$ {USD_BRL_PLANNING_RATE.toFixed(2)}/US$
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Campanhas por mês" value={campaignsPerMonth} onChange={setCampaignsPerMonth} />
            <NumberField label="Imagens por campanha" value={imagesPerCampaign} onChange={setImagesPerCampaign} />
            <NumberField label="Tokens input do plano" value={planInputTokens} onChange={setPlanInputTokens} />
            <NumberField label="Tokens output do plano" value={planOutputTokens} onChange={setPlanOutputTokens} />
            <NumberField label="Texto por imagem" value={imageTextTokens} onChange={setImageTextTokens} />
            <NumberField label="Imagem de referência" value={referenceImageTokens} onChange={setReferenceImageTokens} />
            <NumberField label="Imagem gerada" value={generatedImageTokens} onChange={setGeneratedImageTokens} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-[var(--accent-mint)]" />
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Controle financeiro
              </h3>
            </div>
            <div className="space-y-3 text-sm">
              <Line label="Plano atual" value={billingStatus?.subscription?.planKey ?? "Sem plano ativo"} />
              <Line label="Status" value={billingStatus?.subscription?.status ?? "Inativo"} />
              <Line label="Créditos disponíveis" value={`${billingStatus?.creditBalance ?? 0}`} />
              <Line label="Renovação" value={billingStatus?.subscription?.currentPeriodEnd ? new Date(billingStatus.subscription.currentPeriodEnd).toLocaleDateString("pt-BR") : "-"} />
            </div>
            <button
              type="button"
              onClick={openPortal}
              disabled={!billingStatus?.hasCustomer || portalLoading}
              className="mt-5 h-10 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--border-medium)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {portalLoading ? "Abrindo..." : "Gerenciar cobrança"}
            </button>
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
    </motion.div>
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
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]">
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
        className="h-9 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-mint)] focus:ring-2 focus:ring-[rgba(47,182,125,0.15)]"
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
