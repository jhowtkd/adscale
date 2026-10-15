"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { GuidanceImpactReport, GuidanceImpactSituation, ImpactRate } from "@/server/human-quality/guidance-impact/types";
import { GENERATION_ROLE_LABELS } from "@/server/output-learning/generation-identity";

const SITUATIONS: Record<GuidanceImpactSituation, string> = {
  applied: "Aplicado", control: "Controle", omitted: "Omitido", unknown: "Desconhecido",
};
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
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">Impacto das revisões da orientação</h3>
      <p className="text-sm text-[var(--text-secondary)]">
        Mecanismo: revisões da orientação. As medições de recomendações de client_output_learnings permanecem no relatório anterior.
      </p>
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
              <tr>{["Contexto de origem", "Papel", "Modo / formato", "Situação", "Conjunto e revisões", "Versão fixa", "Gerações", "Aprovação humana", "Rejeição", "Pedido de ajuste", "Nota visual humana", "Integridade factual humana"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr>
            </thead>
            <tbody className="text-[var(--text-primary)]">
              {query.data.groups.map(group => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
