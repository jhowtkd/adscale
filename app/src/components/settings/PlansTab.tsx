"use client";

import { motion } from "framer-motion";
import { Check, Crown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { brlCurrency, calculateForecast, planTiers } from "./pricing-model";
import { useStartCheckout } from "@/lib/hooks/use-billing";

const forecast = calculateForecast();

export default function PlansTab() {
  const checkout = useStartCheckout();

  async function startCheckout(planName: string) {
    const planKey = planName.toLowerCase();
    if (!["starter", "growth", "scale"].includes(planKey)) return;
    await checkout.mutateAsync(planKey as "starter" | "growth" | "scale");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-[18px] font-semibold text-[var(--text-primary)]">
          Planos e limites
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Trial para experimentar, três tiers pagos em reais e limites claros por créditos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {planTiers.map((tier) => {
          const protectedCost = forecast.protectedCampaignCostBrl * tier.campaigns;
          const margin = tier.priceBrl > 0 ? Math.round(((tier.priceBrl - protectedCost) / tier.priceBrl) * 100) : null;
          return (
            <article
              key={tier.name}
              className={cn(
                "relative flex min-h-[360px] flex-col rounded-lg border bg-[var(--surface-base)] p-5",
                tier.recommended
                  ? "border-[var(--accent-green)] shadow-[0_12px_32px_var(--accent-green-dim)0.14)]"
                  : "border-[var(--border-dim)]"
              )}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    tier.recommended
                      ? "bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  )}
                >
                  {tier.badge}
                </span>
                {tier.recommended ? (
                  <Crown size={16} className="text-[var(--accent-green)]" />
                ) : (
                  <Sparkles size={16} className="text-[var(--text-muted)]" />
                )}
              </div>

              <h4 className="text-lg font-semibold text-[var(--text-primary)]">{tier.name}</h4>
              <p className="mt-1 min-h-10 text-sm text-[var(--text-secondary)]">{tier.description}</p>

              <div className="mt-5">
                <span className="text-3xl font-semibold text-[var(--text-primary)]">
                  {brlCurrency.format(tier.priceBrl)}
                </span>
                <span className="text-sm text-[var(--text-secondary)]">/{tier.period}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <PlanStat label="Créditos" value={tier.credits.toString()} />
                <PlanStat label="Campanhas" value={tier.campaigns.toString()} />
                <PlanStat label="Imagens" value={tier.images.toString()} />
                <PlanStat label={tier.trial ? "Status" : "Margem"} value={tier.trial ? "Trial" : `${margin}%`} />
              </div>

              <ul className="mt-5 flex-1 space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                    <Check size={15} className="mt-0.5 shrink-0 text-[var(--accent-green)]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => startCheckout(tier.name)}
                disabled={tier.trial || checkout.isPending}
                className={cn(
                  "mt-5 h-10 rounded-md text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
                  tier.recommended
                    ? "bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-light)]"
                    : "border border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--border-medium)]"
                )}
              >
                {checkout.isPending ? "Abrindo..." : tier.trial ? "Trial incluso" : "Selecionar plano"}
              </button>
            </article>
          );
        })}
      </div>

      <section className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Comparativo
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-dim)] text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="py-3 pr-4 font-medium">Recurso</th>
                {planTiers.map((tier) => (
                  <th key={tier.name} className="px-4 py-3 font-medium">{tier.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              <CompareRow label="Preço" values={planTiers.map((tier) => `${brlCurrency.format(tier.priceBrl)}/${tier.period}`)} />
              <CompareRow label="Créditos" values={planTiers.map((tier) => `${tier.credits}`)} />
              <CompareRow label="Campanhas" values={planTiers.map((tier) => `${tier.campaigns}`)} />
              <CompareRow label="Imagens" values={planTiers.map((tier) => `${tier.images}`)} />
              <CompareRow label="Restilização" values={["Incluída", "Incluída", "Incluída", "Incluída"]} />
              <CompareRow label="Equipe" values={["-", "-", "Básica", "Permissões"]} />
              <CompareRow label="Fila" values={["Padrão", "Padrão", "Padrão", "Prioritária"]} />
            </tbody>
          </table>
        </div>
      </section>
    </motion.div>
  );
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--surface-raised)] p-2">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
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
