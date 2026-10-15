"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { GuidanceImpactComparison, GuidanceImpactReport, GuidanceImpactSituation, ImpactRate } from "@/server/human-quality/guidance-impact/types";
import { GENERATION_ROLE_LABELS } from "@/server/output-learning/generation-identity";

const SITUATIONS: Record<GuidanceImpactSituation, string> = {
  applied: "Aplicado", control: "Controle", omitted: "Omitido", unknown: "Desconhecido",
};
const COMPARISON_REASONS: Record<GuidanceImpactComparison["reasons"][number], string> = {
  missing_control: "Sem controle com o mesmo contexto, papel, modo, formato e versão fixa.",
  unknown_scope: "Escopo desconhecido impede comparação equivalente.",
  unknown_fixed_version: "Versão fixa desconhecida impede comparação equivalente.",
  other_guidance_changed: "Orientação de outros papéis mudou ou não tem rastreio equivalente; revisão não isolada.",
  insufficient_sample: "Mínimo de observações ainda não atingido em nenhum par de métricas.",
};
const SAMPLE_METRICS = { humanDecision: "Decisão humana", humanVisualScore: "Nota visual humana", factualPass: "Integridade factual humana" };
function ComparisonLimits({ comparison }: { comparison: GuidanceImpactComparison | undefined }) {
  if (!comparison) return <>Sem contraste aplicado/controle nesta linha.</>;
  return <div className="space-y-2">
    <p>{comparison.status === "insufficient_sample" ? "Amostra insuficiente neste contraste." : "Resultado inconclusivo neste contraste."}</p>
    <p>{comparison.target === "revision" ? "Contraste de uma revisão da orientação."
      : comparison.target === "set" ? "Contraste do conjunto; não atribui efeito a cada regra."
      : "Contraste não isola uma revisão da orientação."}</p>
    {comparison.reasons.map(reason => <p key={reason}>{COMPARISON_REASONS[reason]}</p>)}
    {Object.entries(comparison.metrics).map(([key, metric]) => <p key={key}>
      {SAMPLE_METRICS[key as keyof typeof SAMPLE_METRICS]}: aplicado n={metric.appliedCount}, controle n={metric.controlCount} — {metric.sufficient ? "mínimo atingido" : "amostra insuficiente"}.
    </p>)}
  </div>;
}
function formatRate(metric: ImpactRate) {
  return metric.value === null ? `Ausente (n=${metric.denominator})`
    : `${(metric.value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% (${metric.numerator}/${metric.denominator})`;
}
async function fetchImpact(clientProfileId: string): Promise<GuidanceImpactReport | "forbidden"> {
  const response = await apiFetch(`/api/feedback/learning-impact?mechanism=guidance_revisions&clientProfileId=${clientProfileId}`);
  if (response.status === 403) return "forbidden";
  if (!response.ok) throw new Error("failed");
  return ((await response.json()) as { report: GuidanceImpactReport }).report;
}

export function BrandGuidanceImpactPanel({ clientProfileId }: { clientProfileId: string }) {
  const query = useQuery({ queryKey: ["brand-guidance-impact", clientProfileId], queryFn: () => fetchImpact(clientProfileId), retry: false });
  if (query.isLoading) return <p className="text-sm text-[var(--text-muted)]">Carregando impacto da orientação…</p>;
  if (query.data === "forbidden") return <p className="text-sm text-[var(--text-muted)]">Relatório restrito a proprietários da plataforma.</p>;
  if (query.isError) return <p className="text-sm text-[var(--text-muted)]">Não foi possível carregar o impacto da orientação.</p>;
  if (!query.data) return null;
  const comparisons = query.data.comparisons;
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">Impacto das revisões da orientação</h3>
      <p className="text-sm text-[var(--text-secondary)]">
        Mecanismo: revisões da orientação. As medições de recomendações de client_output_learnings permanecem no relatório anterior.
      </p>
      <div className="space-y-2 text-sm text-[var(--text-secondary)]">
        <p className="font-medium">{query.data.status === "inconclusive" ? "Resultado inconclusivo" : "Amostra insuficiente"}</p>
        <p>Mínimo de {query.data.samplePolicy.minimumPerArm} gerações distintas por braço e por métrica, com decisão ou avaliação humana disponível.
          Eventos repetidos na mesma Peça não completam a amostra. Atingir esse mínimo não demonstra melhoria.</p>
        <p>Antes/depois simples não demonstra causalidade. Este relatório é descritivo; o mesmo Trabalho não garante entradas idênticas.
          Uma conclusão de efeito exige experimento autorizado com entradas equivalentes e holdout independente.
          Um conjunto com várias regras permite avaliar o conjunto; atribuição individual exige um contraste que isole a revisão.</p>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Cada linha mantém contexto de origem, papel, conjunto, versão fixa, modo e formato separados. Controle exige registro explícito sem orientação;
        omissão e ausência de rastreio aparecem separadamente. Taxas usam decisões humanas explícitas de aprovação, rejeição ou ajuste.
        Favoritos, seleção por agente e irmãs preteridas ficam fora desse denominador. Notas visuais e factuais usam somente a avaliação humana
        mais recente disponível por Peça; n informa quantas avaliações existem. As contagens de geração incluem Peças e execuções de preparação registradas.
      </p>
      {!query.data.groups.length ? <p className="text-sm text-[var(--text-muted)]">Nenhum registro de geração para esta marca.</p> : (
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Impacto por contexto, papel, conjunto e situação da orientação</caption>
            <thead className="bg-[var(--surface-raised)] text-[var(--text-secondary)]">
              <tr>{["Contexto de origem", "Papel", "Modo / formato", "Situação", "Conjunto e revisões", "Versão fixa", "Gerações", "Aprovação humana", "Rejeição", "Pedido de ajuste", "Nota visual humana", "Integridade factual humana", "Limites da comparação"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr>
            </thead>
            <tbody className="text-[var(--text-primary)]">
              {query.data.groups.map((group, index) => (
                <tr key={JSON.stringify([group.contextId, group.role, group.situation, group.setHash, group.fixedPromptVersion, group.generationMode, group.format])} className="border-t border-[var(--border-dim)] align-top">
                  <td className="p-3 break-all">{group.contextKind === "creative_work" ? "Trabalho" : "Campanha legada"}<br />{group.contextId}</td>
                  <td className="p-3">{group.role ? GENERATION_ROLE_LABELS[group.role] : "Desconhecido"}</td>
                  <td className="p-3">{group.generationMode ?? "Desconhecido"} / {group.format ?? "Desconhecido"}</td>
                  <td className="p-3">{SITUATIONS[group.situation]}</td>
                  <td className="p-3"><code className="break-all">{group.setHash ?? "Sem conjunto aplicado"}</code>{group.appliedRefs.map(ref => <p key={`${ref.ruleId}:${ref.revision}`} className="mt-1 break-all">{ref.ruleId} · revisão {ref.revision}</p>)}</td>
                  <td className="p-3 break-all">{group.fixedPromptVersion}</td>
                  <td className="p-3">{group.generationCount}</td>
                  <td className="p-3">{formatRate(group.humanApproval)}</td>
                  <td className="p-3">{formatRate(group.rejection)}</td>
                  <td className="p-3">{formatRate(group.adjustment)}</td>
                  <td className="p-3">{group.humanVisualScore.value === null ? `Ausente (n=${group.humanVisualScore.denominator})` : `${group.humanVisualScore.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} (n=${group.humanVisualScore.denominator})`}</td>
                  <td className="p-3">{formatRate(group.factualPass)}</td>
                  <td className="p-3 min-w-64"><ComparisonLimits comparison={comparisons.find(item => item.appliedGroupIndex === index)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
