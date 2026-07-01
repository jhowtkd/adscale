"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  HYPOTHESIS_PRIMARY_METRICS,
  type HypothesisPrimaryMetric,
} from "@/server/performance/hypothesis/types";
import { PERFORMANCE_PLATFORMS } from "@/server/performance/types";
import type { VariantComparisonReport } from "@/server/performance/hypothesis/types";
import {
  useCampaignComparisons,
  useCampaignHypotheses,
  useCompareHypothesis,
  useCreateHypothesis,
  useDeleteHypothesis,
  useObservationalComparison,
} from "@/lib/hooks/use-hypotheses";

interface DerivationOption {
  id: string;
  label: string;
}

interface HypothesesPanelProps {
  campaignId: string;
  derivations: DerivationOption[];
}

function ComparisonReportView({ report }: { report: VariantComparisonReport }) {
  const t = useTranslations("campaigns.hypotheses");

  return (
    <div className="mt-3 space-y-3 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          {report.kind === "controlled_hypothesis" ? t("report.controlled") : t("report.observational")}
        </span>
        <span className="rounded bg-[var(--surface-base)] px-2 py-0.5 text-xs">
          {t(`verdicts.${report.verdict}`)}
        </span>
        {report.outcome ? (
          <span className="rounded bg-[var(--surface-base)] px-2 py-0.5 text-xs">
            {t(`outcomes.${report.outcome}`)}
          </span>
        ) : null}
      </div>

      {report.exclusions.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-[var(--warning-text)]">
          {report.exclusions.map((e) => (
            <li key={e.code}>{e.message}</li>
          ))}
        </ul>
      ) : null}

      {report.period ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {t("report.period", {
            start: report.period.startDate,
            end: report.period.endDate,
            platform: report.platform ? t("report.platformSuffix", { platform: report.platform }) : "",
            objective: report.objective ? t("report.objectiveSuffix", { objective: report.objective }) : "",
          })}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-dim)] text-[var(--text-secondary)]">
              <th className="py-1 pr-2">{t("report.variant")}</th>
              <th className="py-1 pr-2">{t(`metrics.${report.primaryMetric}`)}</th>
              <th className="py-1 pr-2">{t("report.impressions")}</th>
              <th className="py-1 pr-2">{t("report.clicks")}</th>
              <th className="py-1">{t("report.deltaVsControl")}</th>
            </tr>
          </thead>
          <tbody>
            {report.variants.map((v) => {
              const diff = report.differences.find((d) => d.derivationId === v.derivationId);
              return (
                <tr key={v.derivationId} className="border-b border-[var(--border-dim)]/50">
                  <td className="py-1.5 pr-2">
                    {v.label ?? v.derivationId.slice(0, 8)}
                    {v.role === "control" ? t("report.controlSuffix") : ""}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{v.primaryMetricValue ?? "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{v.sampleSize.impressions}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{v.sampleSize.clicks}</td>
                  <td className="py-1.5 tabular-nums">
                    {diff?.relativeDelta ? `${(Number(diff.relativeDelta) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[var(--text-secondary)]">{t("report.disclaimer")}</p>
    </div>
  );
}

export default function HypothesesPanel({ campaignId, derivations }: HypothesesPanelProps) {
  const t = useTranslations("campaigns.hypotheses");
  const [showForm, setShowForm] = useState(false);
  const [activeReport, setActiveReport] = useState<VariantComparisonReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [variableKey, setVariableKey] = useState("cta");
  const [primaryMetric, setPrimaryMetric] = useState<HypothesisPrimaryMetric>("ctr");
  const [expectedDirection, setExpectedDirection] = useState<"increase" | "decrease">("increase");
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
    [derivations],
  );

  const handleCreate = async () => {
    setMessage(null);
    if (!controlId || !variantId || controlId === variantId) {
      setMessage(t("errors.distinctVariants"));
      return;
    }
    if (!rationale.trim()) {
      setMessage(t("errors.rationaleRequired"));
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
      setMessage(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  };

  const handleCompare = async (hypothesisId: string) => {
    setMessage(null);
    try {
      const result = await compareHypothesis.mutateAsync(hypothesisId);
      setActiveReport(result.report);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("errors.compareFailed"));
    }
  };

  const handleObservational = async () => {
    setMessage(null);
    if (obsIds.length < 2) {
      setMessage(t("errors.minDerivations"));
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
      setMessage(err instanceof Error ? err.message : t("errors.compareFailed"));
    }
  };

  const toggleObsId = (id: string) => {
    setObsIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (derivations.length < 2) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("insufficientDerivations")}</p>;
  }

  if (hypothesesQuery.isLoading || comparisonsQuery.isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (hypothesesQuery.isError || comparisonsQuery.isError) {
    return (
      <p className="text-sm text-[var(--danger-text)]" role="alert">
        {t("loadError")}
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("title")}</h3>
          <p className="text-xs text-[var(--text-secondary)]">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          className="min-h-9 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs hover:bg-[var(--surface-raised)]"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t("cancel") : t("newHypothesis")}
        </button>
      </div>

      {message ? (
        <p className="text-xs text-[var(--danger-text)]" role="alert">
          {message}
        </p>
      ) : null}

      {showForm ? (
        <div className="grid gap-3 rounded-md border border-dashed border-[var(--border-dim)] p-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-[var(--text-secondary)]">{t("form.variableKey")}</span>
            <input
              className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
              value={variableKey}
              onChange={(e) => setVariableKey(e.target.value)}
              placeholder={t("form.variableKeyPlaceholder")}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t("form.primaryMetric")}</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value as HypothesisPrimaryMetric)}
              >
                {HYPOTHESIS_PRIMARY_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {t(`metrics.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t("form.expectedDirection")}</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={expectedDirection}
                onChange={(e) => setExpectedDirection(e.target.value as "increase" | "decrease")}
              >
                <option value="increase">{t("form.increase")}</option>
                <option value="decrease">{t("form.decrease")}</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--text-secondary)]">{t("form.rationale")}</span>
            <textarea
              className="min-h-[72px] rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t("form.control")}</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={controlId}
                onChange={(e) => setControlId(e.target.value)}
              >
                <option value="">{t("form.select")}</option>
                {derivations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t("form.variant")}</span>
              <select
                className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="">{t("form.select")}</option>
                {derivations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--text-secondary)]">{t("form.platformOptional")}</span>
            <select
              className="rounded border border-[var(--border-dim)] bg-transparent px-2 py-1"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="">{t("form.anyPlatform")}</option>
              {PERFORMANCE_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="justify-self-start rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs text-[var(--text-on-accent)] disabled:opacity-50"
            disabled={createHypothesis.isPending}
            onClick={handleCreate}
          >
            {t("form.submit")}
          </button>
        </div>
      ) : null}

      {hypotheses.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {hypotheses.map((h) => (
            <li key={h.id} className="rounded-md border border-[var(--border-dim)] p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">
                    {h.title ?? h.variableKey} · {t(`metrics.${h.primaryMetric}`)}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">{h.rationale}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                    {t("controlledTag", { variable: h.variableKey })}
                  </p>
                  {h.outcome ? (
                    <span className="mt-1 inline-block rounded bg-[var(--surface-raised)] px-2 py-0.5 text-xs">
                      {t(`outcomes.${h.outcome}`)}
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
                    {t("compare")}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[var(--danger-border)] px-2 py-1 text-xs text-[var(--danger-text)]"
                    onClick={() => deleteHypothesis.mutate(h.id)}
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {h.variants
                  .map((v) =>
                    t("variantRole", {
                      role: v.role,
                      label: derivationMap.get(v.derivationId) ?? v.derivationId.slice(0, 8),
                    }),
                  )
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-[var(--border-dim)] pt-4">
        <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          {t("observationalTitle")}
        </h4>
        <p className="mb-2 text-xs text-[var(--text-secondary)]">{t("observationalSubtitle")}</p>
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
                {t(`metrics.${m}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="min-h-9 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs"
            disabled={observational.isPending}
            onClick={handleObservational}
          >
            {t("observationalCompare")}
          </button>
        </div>
      </div>

      {activeReport ? <ComparisonReportView report={activeReport} /> : null}

      {recentComparisons.length > 0 && !activeReport ? (
        <div className="text-xs text-[var(--text-secondary)]">
          {t("lastComparison", { verdict: t(`verdicts.${recentComparisons[0]!.verdict}`) })}
          {recentComparisons[0]?.variantResults ? (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setActiveReport(recentComparisons[0]!.variantResults ?? null)}
            >
              {t("viewReport")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
