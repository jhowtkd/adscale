"use client";

import { useMemo, useState } from "react";
import {
  HYPOTHESIS_PRIMARY_METRICS,
  type HypothesisPrimaryMetric,
} from "@/server/performance/hypothesis/types";
import { PERFORMANCE_PLATFORMS } from "@/server/performance/types";
import type { VariantComparisonReport } from "@/server/performance/hypothesis/types";
import {
  OUTCOME_LABELS,
  useCampaignComparisons,
  useCampaignHypotheses,
  useCompareHypothesis,
  useCreateHypothesis,
  useDeleteHypothesis,
  useObservationalComparison,
  VERDICT_LABELS,
} from "@/lib/hooks/use-hypotheses";

interface DerivationOption {
  id: string;
  label: string;
}

interface HypothesesPanelProps {
  campaignId: string;
  derivations: DerivationOption[];
}

const METRIC_LABELS: Record<HypothesisPrimaryMetric, string> = {
  ctr: "CTR",
  cpc: "CPC",
  cpa: "CPA",
  roas: "ROAS",
  conversions: "Conversões",
  clicks: "Cliques",
  impressions: "Impressões",
  spend: "Investimento",
  conversion_value: "Valor de conversão",
};

function ComparisonReportView({ report }: { report: VariantComparisonReport }) {
  return (
    <div className="mt-3 space-y-3 rounded-md border border-[var(--border-dim)] bg-[var(--bg-elevated)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          {report.kind === "controlled_hypothesis"
            ? "Hipótese controlada"
            : "Observação de mídia"}
        </span>
        <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-xs">
          {VERDICT_LABELS[report.verdict]}
        </span>
        {report.outcome ? (
          <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-xs">
            {OUTCOME_LABELS[report.outcome]}
          </span>
        ) : null}
      </div>

      {report.exclusions.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-amber-600 dark:text-amber-400">
          {report.exclusions.map((e) => (
            <li key={e.code}>{e.message}</li>
          ))}
        </ul>
      ) : null}

      {report.period ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Período: {report.period.startDate} — {report.period.endDate}
          {report.platform ? ` · ${report.platform}` : ""}
          {report.objective ? ` · Objetivo: ${report.objective}` : ""}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-dim)] text-[var(--text-secondary)]">
              <th className="py-1 pr-2">Variante</th>
              <th className="py-1 pr-2">{METRIC_LABELS[report.primaryMetric]}</th>
              <th className="py-1 pr-2">Impressões</th>
              <th className="py-1 pr-2">Cliques</th>
              <th className="py-1">Δ vs controle</th>
            </tr>
          </thead>
          <tbody>
            {report.variants.map((v) => {
              const diff = report.differences.find(
                (d) => d.derivationId === v.derivationId
              );
              return (
                <tr key={v.derivationId} className="border-b border-[var(--border-dim)]/50">
                  <td className="py-1.5 pr-2">
                    {v.label ?? v.derivationId.slice(0, 8)}
                    {v.role === "control" ? " (controle)" : ""}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {v.primaryMetricValue ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{v.sampleSize.impressions}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{v.sampleSize.clicks}</td>
                  <td className="py-1.5 tabular-nums">
                    {diff?.relativeDelta
                      ? `${(Number(diff.relativeDelta) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[var(--text-secondary)]">
        Comparação observacional — não implica causalidade nem significância estatística.
      </p>
    </div>
  );
}

export default function HypothesesPanel({
  campaignId,
  derivations,
}: HypothesesPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [activeReport, setActiveReport] = useState<VariantComparisonReport | null>(
    null
  );
  const [message, setMessage] = useState<string | null>(null);

  const [variableKey, setVariableKey] = useState("cta");
  const [primaryMetric, setPrimaryMetric] =
    useState<HypothesisPrimaryMetric>("ctr");
  const [expectedDirection, setExpectedDirection] = useState<"increase" | "decrease">(
    "increase"
  );
  const [rationale, setRationale] = useState("");
  const [controlId, setControlId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [platform, setPlatform] = useState<string>("");

  const [obsIds, setObsIds] = useState<string[]>([]);
  const [obsMetric, setObsMetric] = useState<HypothesisPrimaryMetric>("ctr");

  const hypothesesQuery = useCampaignHypotheses(campaignId);
  const comparisonsQuery = useCampaignComparisons(campaignId);
  const createHypothesis = useCreateHypothesis(campaignId);
  const compareHypothesis = useCompareHypothesis(campaignId);
  const deleteHypothesis = useDeleteHypothesis(campaignId);
  const observational = useObservationalComparison(campaignId);

  const hypotheses = hypothesesQuery.data?.hypotheses ?? [];
  const recentComparisons = comparisonsQuery.data?.comparisons ?? [];

  const derivationMap = useMemo(
    () => new Map(derivations.map((d) => [d.id, d.label])),
    [derivations]
  );

  const handleCreate = async () => {
    setMessage(null);
    if (!controlId || !variantId || controlId === variantId) {
      setMessage("Selecione controle e variação distintos.");
      return;
    }
    if (!rationale.trim()) {
      setMessage("Informe a justificativa da hipótese.");
      return;
    }
    try {
      await createHypothesis.mutateAsync({
        variableKey,
        primaryMetric,
        expectedDirection,
        rationale,
        platform: platform || null,
        variants: [
          { derivationId: controlId, role: "control" },
          { derivationId: variantId, role: "variant" },
        ],
      });
      setShowForm(false);
      setRationale("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao criar hipótese");
    }
  };

  const handleCompare = async (hypothesisId: string) => {
    setMessage(null);
    try {
      const result = await compareHypothesis.mutateAsync(hypothesisId);
      setActiveReport(result.report);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro na comparação");
    }
  };

  const handleObservational = async () => {
    setMessage(null);
    if (obsIds.length < 2) {
      setMessage("Selecione pelo menos duas derivações.");
      return;
    }
    try {
      const result = await observational.mutateAsync({
        primaryMetric: obsMetric,
        derivationIds: obsIds,
        platform: platform || null,
      });
      setActiveReport(result.report);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro na comparação");
    }
  };

  const toggleObsId = (id: string) => {
    setObsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (derivations.length < 2) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Crie pelo menos duas derivações e importe resultados antes de registrar hipóteses.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Hipóteses criativas</h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Experimentos com variável principal e vereditos honestos sobre os dados importados.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs hover:bg-[var(--bg-elevated)]"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "Nova hipótese"}
        </button>
      </div>

      {message ? (
        <p className="text-xs text-red-500" role="alert">
          {message}
        </p>
      ) : null}

      {showForm ? (
        <div className="grid gap-3 rounded-md border border-dashed border-[var(--border-dim)] p-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-[var(--text-secondary)]">Variável principal</span>
            <input
              className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
              value={variableKey}
              onChange={(e) => setVariableKey(e.target.value)}
              placeholder="ex: cta, formato, headline"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">Métrica primária</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={primaryMetric}
                onChange={(e) =>
                  setPrimaryMetric(e.target.value as HypothesisPrimaryMetric)
                }
              >
                {HYPOTHESIS_PRIMARY_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">Direção esperada</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={expectedDirection}
                onChange={(e) =>
                  setExpectedDirection(e.target.value as "increase" | "decrease")
                }
              >
                <option value="increase">Aumentar</option>
                <option value="decrease">Diminuir</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--text-secondary)]">Justificativa</span>
            <textarea
              className="min-h-[72px] rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">Controle</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={controlId}
                onChange={(e) => setControlId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {derivations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">Variação</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {derivations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--text-secondary)]">Plataforma (opcional)</span>
            <select
              className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="">Qualquer</option>
              {PERFORMANCE_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="justify-self-start rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            disabled={createHypothesis.isPending}
            onClick={handleCreate}
          >
            Registrar hipótese
          </button>
        </div>
      ) : null}

      {hypotheses.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Nenhuma hipótese registrada ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {hypotheses.map((h) => (
            <li
              key={h.id}
              className="rounded-md border border-[var(--border-dim)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {h.title ?? h.variableKey} · {METRIC_LABELS[h.primaryMetric]}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">{h.rationale}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                    Hipótese controlada · variável: {h.variableKey}
                  </p>
                  {h.outcome ? (
                    <span className="mt-1 inline-block rounded bg-[var(--bg-elevated)] px-2 py-0.5 text-xs">
                      {OUTCOME_LABELS[h.outcome]}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border border-[var(--border-dim)] px-2 py-1 text-xs"
                    disabled={compareHypothesis.isPending}
                    onClick={() => handleCompare(h.id)}
                  >
                    Comparar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-500"
                    onClick={() => deleteHypothesis.mutate(h.id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {h.variants
                  .map(
                    (v) =>
                      `${v.role}: ${derivationMap.get(v.derivationId) ?? v.derivationId.slice(0, 8)}`
                  )
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-[var(--border-dim)] pt-4">
        <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          Comparação observacional
        </h4>
        <p className="mb-2 text-xs text-[var(--text-secondary)]">
          Compare derivações sem hipótese formal — resultado rotulado como observação de mídia.
        </p>
        <div className="flex flex-wrap gap-2">
          {derivations.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-1 rounded border border-[var(--border-dim)] px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={obsIds.includes(d.id)}
                onChange={() => toggleObsId(d.id)}
              />
              {d.label}
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select
            className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1 text-xs"
            value={obsMetric}
            onChange={(e) => setObsMetric(e.target.value as HypothesisPrimaryMetric)}
          >
            {HYPOTHESIS_PRIMARY_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs"
            disabled={observational.isPending}
            onClick={handleObservational}
          >
            Comparar (observacional)
          </button>
        </div>
      </div>

      {activeReport ? <ComparisonReportView report={activeReport} /> : null}

      {recentComparisons.length > 0 && !activeReport ? (
        <div className="text-xs text-[var(--text-secondary)]">
          Última comparação: {VERDICT_LABELS[recentComparisons[0]!.verdict]}
          {recentComparisons[0]?.variantResults ? (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() =>
                setActiveReport(recentComparisons[0]!.variantResults ?? null)
              }
            >
              Ver relatório
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
